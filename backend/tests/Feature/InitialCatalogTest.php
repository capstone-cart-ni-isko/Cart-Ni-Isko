<?php

namespace Tests\Feature;

use App\Models\Prodvar;
use App\Models\Product;
use App\Http\Controllers\ProductsAPI;
use Database\Seeders\ProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The BU Labels 2025 initial catalog (initial_products_directory [DONT EDIT].docx).
 *
 * These tests pin the transcription in database/data/initial_catalog.json
 * against the document and the photo folder, so the inventory the storefront
 * shows can never silently drift away from the merchandise directory again:
 * a product dropped from the sheet, a photo renamed, or a category the API
 * refuses all fail here instead of in the store.
 */
class InitialCatalogTest extends TestCase
{
    use RefreshDatabase;

    /** @return array catalog payload from database/data/initial_catalog.json */
    private function catalog(): array
    {
        $path = database_path('data/initial_catalog.json');
        $this->assertFileExists($path);

        $decoded = json_decode((string) file_get_contents($path), true);
        $this->assertIsArray($decoded);

        return $decoded;
    }

    public function test_the_catalog_sheet_is_complete_and_self_consistent()
    {
        $sheet = $this->catalog();
        $products = $sheet['products'] ?? [];

        // The directory lists 16 products and 49 photos.
        $this->assertCount(16, $products, 'The directory lists 16 products.');

        $photoDir = base_path('../initial_products');
        $photosOnDisk = [];
        $walker = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($photoDir, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($walker as $file) {
            if ($file->isFile() && stripos($file->getFilename(), '.docx') === false) {
                $photosOnDisk[] = str_replace('\\', '/', $walker->getSubPath() . '/' . $file->getFilename());
            }
        }
        $this->assertCount(49, $photosOnDisk, 'The directory carries 49 photos.');

        $names = [];
        $tags = [];
        $photosUsed = [];

        foreach ($products as $product) {
            $name = $product['prod_name'] ?? '';
            $this->assertNotSame('', trim($name));

            // Rule 61/62 + REQ-ADD_PROD-02: one name and one tag per product.
            $this->assertArrayNotHasKey(
                strtolower($name),
                $names,
                "\"{$name}\" is listed twice in the directory."
            );
            $names[strtolower($name)] = true;

            $tag = (string) ($product['prod_tag'] ?? '');
            $this->assertNotSame('', $tag, "\"{$name}\" needs a prod_tag.");
            $this->assertMatchesRegularExpression('/^[A-Z0-9][A-Z0-9-]*$/', $tag, "Bad prod_tag \"{$tag}\".");
            $this->assertArrayNotHasKey(
                strtolower($tag),
                $tags,
                "The prod_tag \"{$tag}\" is used by two products."
            );
            $tags[strtolower($tag)] = true;

            // REQ-ADD_PROD-08: the directory never lists a zero price.
            $this->assertGreaterThan(0, (float) ($product['prod_price'] ?? 0), "\"{$name}\" has no price.");

            // REQ-ADD_PROD-04: every category is inside the whitelist, spelled
            // however the directory spells it.
            $this->assertContains(
                ProductsAPI::validatedCategory($product['prod_categ'] ?? null, $message),
                ProductsAPI::categoryWhitelist(),
                $message ?? ''
            );

            // REQ-ADD_PROD-03: at least one variation per product.
            $this->assertNotEmpty($product['variants'] ?? [], "\"{$name}\" has no variant.");

            foreach ((array) $product['variants'] as $variant) {
                $photo = (string) ($variant['photo'] ?? '');
                $this->assertContains($photo, $photosOnDisk, "Photo \"{$photo}\" is not in initial_products.");
                $photosUsed[strtolower($photo)] = true;
            }
        }

        // Every photo on disk is used by the product the directory points it at.
        $this->assertSame(
            49,
            count($photosUsed),
            'Not every photo in initial_products is referenced by the directory.'
        );
    }

    public function test_every_directory_category_survives_the_backend_whitelist()
    {
        $this->assertSame([
            'Shirts', 'Hoodies', 'Jackets', 'Caps', 'Lanyards',
            'Stickers', 'Pins', 'Totebags', 'Keychains',
        ], ProductsAPI::categoryWhitelist());

        $categories = [];
        foreach ($this->catalog()['products'] ?? [] as $product) {
            $categories[$product['prod_categ']] = true;
        }

        // Legacy Windbreaker records now display and filter as Jackets.
        $this->assertArrayHasKey('Windbreakers', $categories);
        $this->assertSame('Jackets', ProductsAPI::normalizeCategory('Windbreakers'));
        $this->assertSame('Jackets', ProductsAPI::normalizeCategory('Varsity Jacket'));
        $this->assertSame('Totebags', ProductsAPI::normalizeCategory('Tote Bags'));
        $this->assertSame('Keychains', ProductsAPI::normalizeCategory('Key Chain'));
        $this->assertSame('Lanyards', ProductsAPI::normalizeCategory('Accessories', 'BUnique Lanyard & Badge'));
        $this->assertSame('Pins', ProductsAPI::normalizeCategory('Accessories', 'University Pin Badge'));
        $this->assertSame('Accessories', ProductsAPI::normalizeCategory('Accessories', 'Insulated Water Bottle'));
        $this->assertSame('Keychains', ProductsAPI::validatedCategory('Keychains'));

        foreach (array_keys($categories) as $category) {
            $this->assertContains(
                ProductsAPI::normalizeCategory($category),
                ProductsAPI::categoryWhitelist(),
                "Category \"{$category}\" is outside the whitelist."
            );
        }
    }

    public function test_published_pictures_resolve_against_the_answering_backend()
    {
        // Stored host-agnostic, resolved on the way out.
        $this->assertSame(
            config('app.url') . '/storage/uploads/product/pins-tatak-bueno-green.png',
            ProductsAPI::publicPicture('/storage/uploads/product/pins-tatak-bueno-green.png')
        );

        // The upload endpoint's `path` spelling is honoured too.
        $this->assertSame(
            config('app.url') . '/storage/uploads/product/x.png',
            ProductsAPI::publicPicture('uploads/product/x.png')
        );

        // Never prefixed twice, and an empty picture stays null.
        $this->assertSame('https://cdn.example/a.png', ProductsAPI::publicPicture('https://cdn.example/a.png'));
        $this->assertSame('data:image/png;base64,AAA', ProductsAPI::publicPicture('data:image/png;base64,AAA'));
        $this->assertNull(ProductsAPI::publicPicture(null));
        $this->assertNull(ProductsAPI::publicPicture(''));
    }

    public function test_the_seeder_writes_the_whole_directory_as_product_and_prodvar_rows()
    {
        $this->seed(ProductSeeder::class);

        $sheet = $this->catalog();

        $this->assertSame(16, Product::count(), 'The directory lists 16 products.');

        $expectedVariations = 0;
        foreach ($sheet['products'] as $index => $product) {
            $row = Product::where('prod_tag', $product['prod_tag'])->first();
            $this->assertNotNull($row, "\"{$product['prod_name']}\" was not seeded.");
            $this->assertSame($product['prod_name'], $row->prod_name);
            $this->assertSame((float) $product['prod_price'], (float) $row->prod_price);
            $this->assertSame(
                ProductsAPI::validatedCategory($product['prod_categ']),
                $row->prod_categ
            );

            $wanted = [];
            foreach ((array) $product['variants'] as $variant) {
                $sizes = (array) ($variant['sizes'] ?? $product['sizes'] ?? ['One Size']);
                $wanted[] = max(1, count($sizes));
            }
            $expectedVariations += array_sum($wanted);

            // Every colour/size combination the directory lists is a row.
            $this->assertSame(
                array_sum($wanted),
                $row->variations()->whereNull('prodvar_deleted')->count(),
                "\"{$product['prod_name']}\" has the wrong number of variations."
            );
            $this->assertSame(array_sum($wanted), (int) $row->prod_total_var);

            // Exactly one main variation, and it carries a picture (rule 19).
            $this->assertSame(
                1,
                $row->variations()->where('prodvar_main', true)->count(),
                "\"{$product['prod_name']}\" must hold exactly one main variation."
            );
            $this->assertTrue(
                $row->variations()->where('prodvar_main', true)->first()->prodvar_pic !== null,
                "\"{$product['prod_name']}\"'s main variation has no photo."
            );
        }

        $this->assertSame($expectedVariations, Prodvar::count());
        $this->assertSame(49, Prodvar::whereNotNull('prodvar_pic')->distinct()->count('prodvar_pic'));

        // Re-running the seeder must not duplicate anything.
        $this->seed(ProductSeeder::class);
        $this->assertSame(16, Product::count());
        $this->assertSame($expectedVariations, Prodvar::count());
    }

    /**
     * render.yaml builds the image from backend/ alone, so
     * ../initial_products is outside the Docker context and is not shipped.
     * The photos themselves ARE shipped (COPY . . takes storage/app/public),
     * so the seeder must keep working off the already-published files instead
     * of dropping every variation on a fresh deploy.
     */
    public function test_the_seeder_keeps_publishing_when_the_source_folder_is_absent()
    {
        $published = glob(storage_path('app/public/uploads/product/pins-tatak-bueno-green.png'));
        $this->assertNotEmpty($published, 'No published pin photo to seed off.');

        // Same order the seeder itself uses: make sure the fallback branch
        // really is what the deployed image relies on.
        $seeder = new class() extends ProductSeeder {
            public function publish(string $relative, string $photoDir, string $uploadDir): ?string
            {
                return $this->publishPhoto($relative, $photoDir, $uploadDir);
            }
        };

        $uploadDir = storage_path('app/public/uploads/product');
        $nonexistent = base_path('does-not-exist');

        $this->assertSame(
            '/storage/uploads/product/pins-tatak-bueno-green.png',
            $seeder->publish('Pins/tatak_bueno - green.png', $nonexistent, $uploadDir),
            'A published photo must survive a deploy that ships no source folder.'
        );

        // And a photo that is in neither place is still refused.
        $this->assertNull(
            $seeder->publish('Pins/no-such-photo.png', $nonexistent, $uploadDir)
        );
    }

    public function test_the_presented_catalog_shows_the_directory_pictures_and_sizes()
    {
        $this->seed(ProductSeeder::class);

        // The directory's photo column is the path inside initial_products, so
        // it has to be read the same way the seeder reads it.
        $photoDir = base_path('../initial_products');
        $photosOnDisk = [];
        $walker = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($photoDir, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($walker as $file) {
            if ($file->isFile() && stripos($file->getFilename(), '.docx') === false) {
                $photosOnDisk[] = str_replace('\\', '/', $walker->getSubPath() . '/' . $file->getFilename());
            }
        }

        $row = Product::where('prod_tag', 'BABY-TEE')->first();
        $presented = ProductsAPI::present($row);

        // The size axis the directory lists is what the storefront offers.
        $this->assertSame(
            ['Extra Small', 'Small', 'Medium', 'Large', 'Extra Large', '2XL'],
            $presented['prod_sizes']
        );

        // The colour axis is the swatch list, and every swatch carries the
        // photograph the directory points at that colourway.
        $this->assertSame(['Blue', 'Red', 'Green'], array_column($presented['prod_colors'], 'name'));
        foreach ($presented['prod_colors'] as $swatch) {
            $this->assertSame(
                config('app.url') . '/storage/uploads/product/shirts-baby-tee-'
                    . strtolower($swatch['name']) . '.png',
                $swatch['image']
            );
        }

        $this->assertSame(1800, $presented['prod_qty'], '3 colours x 6 sizes x 100 pieces.');
        $this->assertStringContainsString(
            '/storage/uploads/product/shirts-baby-tee-blue.png',
            (string) $presented['main_image']
        );

        // Every price the directory lists, per category, in directory order.
        $prices = Product::orderBy('prod_id')->pluck('prod_price')->map(fn ($p) => (float) $p)->all();
        $this->assertSame(
            array_map(fn ($p) => (float) $p['prod_price'], $this->catalog()['products']),
            $prices
        );
    }
}
