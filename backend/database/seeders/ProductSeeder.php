<?php

namespace Database\Seeders;

use App\Models\Prodvar;
use App\Models\Product;
use App\Support\IdAllocator;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the `product` / `prodvar` tables from the store's BU Labels 2025
 * merchandise directory (initial_products/initial_products_directory
 * [DONT EDIT].docx), transcribed into database/data/initial_catalog.json.
 *
 * WHY THIS SHAPE
 * ---------------
 * system-new.docx SCHEMA defines the inventory as exactly two tables:
 *
 *   product  - prod_id, prod_name, prod_categ, prod_desc, prod_tag,
 *              prod_price, prod_rating, prod_reviews, prod_total_var,
 *              prod_created, prod_disabled, prod_deleted
 *   prodvar  - prodvar_id, prod_id, prodvar_name, prodvar_pic, prodvar_stock,
 *              prodvar_main, prodvar_markup, prodvar_options, prodvar_preorder,
 *              prodvar_created, prodvar_disabled, prodvar_deleted
 *
 * There is no prod_sizes / prod_colors / prod_images / prod_stock_matrix
 * column anywhere in that list, so the older JSON columns the previous
 * version of this seeder wrote no longer exist on the live connection: every
 * one of those inserts died with "column ... does not exist". The legacy JSON
 * shapes are not stored at all - they are DERIVED at read time by
 * ProductsAPI::present(), which rebuilds prod_qty, prod_status, prod_images,
 * prod_sizes, prod_colors and prod_stock_matrix from the prodvar rows. One row
 * per colour/size COMBINATION is therefore the whole inventory: a colour × size
 * merchandise shirt is one row per size, and `prodvar_options` carries the
 * {Color, Size} pair that produced it.
 *
 * Photos: every photo listed in the directory is copied into the public
 * uploads directory (the same directory, naming scheme and 2 MB PNG/JPG rules
 * POST /api/uploads uses) and its public path is stored on each prodvar row, so
 * the catalog card, the detail picker and the wishlist/bag rows all read the
 * same picture.
 *
 * IDEMPOTENT: a product whose prod_tag already exists is skipped, and its
 * variation set is reconciled against the directory (rows the directory no
 * longer lists are soft-deleted, new ones are added) so re-running after an
 * edit never duplicates stock.
 *
 * Only the backend touches the database here: no controller, model, route or
 * migration is created, and every rule ProductsAPI::addProduct enforces
 * (REQ-ADD_PROD-01..08) is re-applied before a row is written.
 */
class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = $this->loadCatalog();
        if ($catalog === null) {
            $this->command?->error('initial_catalog.json not found or unreadable.');
            return;
        }

        $photoDir = base_path('../initial_products');
        $uploadDir = storage_path('app/public/uploads/product');

        $created = 0;
        $synced = 0;
        $current = 0;

        foreach ($catalog as $index => $item) {
            $name = trim((string) ($item['prod_name'] ?? ''));
            if ($name === '') {
                $this->command?->warn("Row {$index}: no prod_name, skipped.");
                continue;
            }

            // REQ-ADD_PROD-02 / rule 61-62: names and tags are unique
            // case-insensitively, exactly as addProduct judges them.
            if (Product::whereRaw('lower(prod_name) = lower(?)', [$name])->exists()) {
                $existing = Product::whereRaw('lower(prod_name) = lower(?)', [$name])->first();
                $wanted = $this->variations($item, $photoDir, $uploadDir);
                if ($wanted === null) {
                    $current++; // no usable photo: nothing to reconcile, leave the row alone
                } elseif ($this->reconcile($existing, $wanted)) {
                    $synced++;
                } else {
                    $current++;
                }
                continue;
            }

            $tag = strtoupper(trim((string) ($item['prod_tag'] ?? '')));
            if ($tag === '' || Product::whereRaw('lower(prod_tag) = lower(?)', [$tag])->exists()) {
                $tag = $this->uniqueTag($name);
            }

            // REQ-ADD_PROD-08: a product with a zero or negative price is refused.
            $price = round((float) ($item['prod_price'] ?? 0), 2);
            if ($price <= 0) {
                $this->command?->warn("\"{$name}\": prod_price must be greater than zero, skipped.");
                continue;
            }

            // REQ-ADD_PROD-04: categories are a predefined, system-wide set.
            $categ = \App\Http\Controllers\ProductsAPI::validatedCategory(
                $item['prod_categ'] ?? null,
                $categError
            );
            if ($categ === null) {
                $this->command?->warn("\"{$name}\": {$categError}");
                continue;
            }

            $variations = $this->variations($item, $photoDir, $uploadDir);
            if ($variations === null || $variations === []) {
                // REQ-ADD_PROD-03: at least one variation per product.
                $this->command?->warn("\"{$name}\": no usable variation, skipped.");
                continue;
            }

            DB::transaction(function () use ($name, $tag, $price, $categ, $item, $variations) {
                $product = Product::create([
                    // SYSTEM RULE: product.prod_id is a bare bigint NOT NULL
                    // primary key with no sequence on the live table, so the
                    // key is allocated here, inside the transaction, exactly as
                    // ProductsAPI::addProduct does.
                    'prod_id'        => IdAllocator::next('product', 'prod_id'),
                    'prod_name'      => $name,
                    'prod_tag'       => $tag,
                    'prod_categ'     => $categ,
                    'prod_price'     => $price,
                    'prod_desc'      => $item['prod_desc'] ?? null,
                    'prod_rating'    => 0,
                    'prod_reviews'   => 0,
                    'prod_total_var' => count($variations),
                    'prod_created'   => now(),
                    'prod_disabled'  => null, // active (REQ-MANAGE_INV-02)
                    'prod_deleted'   => null,
                ]);

                foreach ($variations as $variation) {
                    Prodvar::create($variation + [
                        // prodvar.prodvar_id has no sequence either.
                        'prodvar_id'      => IdAllocator::next('prodvar', 'prodvar_id'),
                        'prod_id'         => $product->prod_id,
                        'prodvar_created' => now(),
                        'prodvar_disabled'=> null,
                        'prodvar_deleted' => null,
                    ]);
                }
            });

            $created++;
        }

        $this->command?->info(
            "Seeded {$created} new products, reconciled {$synced}, {$current} already current."
        );
        $this->command?->info('product=' . Product::count() . ' prodvar=' . Prodvar::count());
    }

    // ==========================================
    // CATALOG SOURCE
    // ==========================================

    /**
     * The directory as a list of product rows. Kept as one accessor so the
     * source file can move without touching the seeding logic.
     */
    private function loadCatalog(): ?array
    {
        $path = database_path('data/initial_catalog.json');
        if (! file_exists($path)) {
            return null;
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (! is_array($decoded)) {
            return null;
        }

        return $decoded['products'] ?? $decoded;
    }

    // ==========================================
    // VARIATIONS
    // ==========================================

    /**
     * Every prodvar row the directory lists for one product: one row per
     * colour/size combination, each carrying its own photo, stock and
     * {Color, Size} options. Returns null when the directory row is unusable.
     *
     * @return array<int, array>|null
     */
    private function variations(array $item, string $photoDir, string $uploadDir): ?array
    {
        $stock = max(0, (int) ($item['stock_per_variation'] ?? 100));
        $sizes = array_values(array_filter(array_map(
            fn ($size) => trim((string) $size),
            (array) ($item['sizes'] ?? ['One Size'])
        )));
        $variants = (array) ($item['variants'] ?? []);

        if ($variants === []) {
            return null;
        }

        $rows = [];
        $seen = [];

        foreach ($variants as $variant) {
            $color = trim((string) ($variant['color'] ?? ''));
            $variantSizes = array_values(array_filter(array_map(
                fn ($size) => trim((string) $size),
                (array) ($variant['sizes'] ?? $sizes)
            )));
            if ($variantSizes === []) {
                $variantSizes = $sizes;
            }

            $pic = $this->publishPhoto(
                trim((string) ($variant['photo'] ?? '')),
                $photoDir,
                $uploadDir
            );
            if ($pic === null) {
                return null; // a missing photo makes the whole product unusable
            }

            foreach ($variantSizes as $size) {
                $options = $color === '' ? ['Size' => $size] : ['Color' => $color, 'Size' => $size];
                $label = \App\Http\Controllers\ProductsAPI::optionLabel($options, $color ?: $size);

                $signature = strtolower($label);
                if (isset($seen[$signature])) {
                    continue; // the directory lists the same combination twice
                }
                $seen[$signature] = true;

                $rows[] = [
                    'prodvar_name'     => $label,
                    'prodvar_pic'      => $pic,
                    'prodvar_stock'    => $stock,
                    'prodvar_main'     => false,
                    'prodvar_markup'   => 0.0,
                    'prodvar_options'  => \App\Http\Controllers\ProductsAPI::encodeOptions($options),
                    'prodvar_preorder' => false,
                ];
            }
        }

        if ($rows === []) {
            return null;
        }

        // Rule 19: exactly one main variation, and it is the first one, so the
        // catalog card always resolves an image.
        $rows[array_key_first($rows)]['prodvar_main'] = true;

        return $rows;
    }

    /**
     * Publish one photo and return its host-agnostic public path.
     *
     * Two sources are accepted, in order:
     *
     *  1. the initial_products directory - the authoritative copy, used on a
     *     developer machine and on any fresh checkout;
     *  2. an already-published file in the uploads directory - which is what
     *     the Docker image carries (render.yaml builds from backend/ alone,
     *     so ../initial_products is outside the context and is not shipped).
     *
     * A photo already sitting in the uploads directory therefore survives a
     * deploy even when the source folder is absent, which is what stops the
     * deployed catalog from losing every picture.
     *
     * The file is only copied when it is missing or different, so re-running
     * the seeder never churns storage. Returns null when the photo is absent
     * from BOTH places, or not one of the formats and sizes REQ-ADD_PROD-07
     * allows.
     */
    protected function publishPhoto(string $relative, string $photoDir, string $uploadDir): ?string
    {
        if ($relative === '') {
            return null;
        }

        $relative = str_replace('\\', '/', $relative);
        $extension = strtolower(pathinfo($relative, PATHINFO_EXTENSION));
        if (! in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
            return null;
        }

        // A stable, human-readable name: the storefront never shows it, but an
        // admin can find the photo in the uploads folder.
        $folder = pathinfo($relative, PATHINFO_DIRNAME);
        $name = strtolower((string) preg_replace('/[^A-Za-z0-9]+/', '-', $folder)) . '-'
            . strtolower((string) preg_replace('/[^A-Za-z0-9]+/', '-', pathinfo($relative, PATHINFO_FILENAME)))
            . '.' . $extension;

        $target = $uploadDir . '/' . $name;
        $source = $photoDir . '/' . $relative;

        if (is_file($source)) {
            // REQ-ADD_PROD-07: the same 2 MB ceiling POST /api/uploads enforces.
            if (filesize($source) > 2 * 1024 * 1024) {
                return null;
            }

            if (! is_dir($uploadDir)) {
                @mkdir($uploadDir, 0775, true);
            }

            if (! is_file($target) || filesize($target) !== filesize($source) ||
                md5_file($target) !== md5_file($source)) {
                if (! @copy($source, $target)) {
                    return null;
                }
            }

            return '/storage/uploads/product/' . $name;
        }

        // The source folder is not shipped (Docker builds from backend/), but
        // the published photo still is: keep it rather than dropping the
        // variation, and only insist it is a real image of an allowed size.
        if (is_file($target) && filesize($target) > 0 && filesize($target) <= 2 * 1024 * 1024) {
            return '/storage/uploads/product/' . $name;
        }

        return null;
    }

    // ==========================================
    // IDEMPOTENCY
    // ==========================================

    /**
     * Reconcile the variations of an already-seeded product with the directory:
     * a combination that is gone is soft-deleted, a new one is added, and stock
     * on an existing combination is left as the admin set it. Returns true when
     * anything changed.
     */
    private function reconcile(Product $product, array $wanted): bool
    {
        $existing = Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->get()
            ->keyBy(fn (Prodvar $row) => strtolower((string) $row->prodvar_name));

        $changed = false;

        foreach ($wanted as $row) {
            $key = strtolower((string) $row['prodvar_name']);
            if ($existing->has($key)) {
                // Keep the admin's own stock and markup; only the photo and the
                // option map are refreshed so a re-run cannot resurrect an old
                // picture.
                $current = $existing->get($key);
                if ($current->prodvar_pic !== $row['prodvar_pic'] ||
                    $current->prodvar_options !== $row['prodvar_options']) {
                    $current->update([
                        'prodvar_pic'     => $row['prodvar_pic'],
                        'prodvar_options' => $row['prodvar_options'],
                    ]);
                    $changed = true;
                }
                continue;
            }

            DB::transaction(function () use ($product, $row) {
                Prodvar::create($row + [
                    'prodvar_id'       => IdAllocator::next('prodvar', 'prodvar_id'),
                    'prod_id'          => $product->prod_id,
                    'prodvar_created'  => now(),
                    'prodvar_disabled' => null,
                    'prodvar_deleted'  => null,
                ]);
            });
            $changed = true;
        }

        // Combinations the directory no longer lists stop being sellable but
        // keep their row, so an order already placed against them still
        // resolves (REQ-MANAGE_INV-02 always hides them from the catalog).
        foreach ($existing as $key => $row) {
            if (in_array($key, array_map('strtolower', array_column($wanted, 'prodvar_name')), true)) {
                continue;
            }
            $row->update(['prodvar_deleted' => now()]);
            $changed = true;
        }

        // Exactly one live main variation per product (rule 19).
        $live = Prodvar::where('prod_id', $product->prod_id)->whereNull('prodvar_deleted')->get();
        $main = $live->first(fn (Prodvar $row) => (bool) $row->prodvar_main)
            ?? $live->first();
        if ($main !== null && ! (bool) $main->prodvar_main) {
            Prodvar::where('prod_id', $product->prod_id)->update(['prodvar_main' => false]);
            $main->update(['prodvar_main' => true]);
            $changed = true;
        }

        if ((int) $product->prod_total_var !== $live->count()) {
            $product->update(['prod_total_var' => $live->count()]);
            $changed = true;
        }

        return $changed;
    }

    /**
     * REQ-ADD_PROD-07: a unique prod_tag derived from the name.
     */
    private function uniqueTag(string $name): string
    {
        $base = strtoupper((string) preg_replace('/[^A-Za-z0-9]+/', '', $name)) ?: 'PROD';

        $tag = $base;
        $attempt = 1;
        while (Product::whereRaw('lower(prod_tag) = lower(?)', [$tag])->exists()) {
            $tag = $base . '-' . $attempt++;
        }

        return $tag;
    }
}
