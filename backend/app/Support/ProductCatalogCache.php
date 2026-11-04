<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

class ProductCatalogCache
{
    public static function productListKey(?string $status = 'active', ?string $category = null, ?string $stock = null): string
    {
        $status = $status ?: 'all';
        $category = $category ?: 'all';
        $stock = $stock ?: 'all';

        // The generation is part of every list key: bumping it retires every
        // filtered variant at once (the file cache store has no tags, so
        // forgetting only the "all" keys used to leave e.g. a shirts-only
        // list stale for up to 30 minutes).
        return 'catalog:products:list:g' . self::generation() . ':' . strtolower($status) . ':' . strtolower($category) . ':' . strtolower($stock);
    }

    private const GENERATION_KEY = 'catalog:products:generation';

    public static function generation(): int
    {
        return (int) Cache::get(self::GENERATION_KEY, 1);
    }

    /** Retire every cached product list (stock or listing changed). */
    public static function bumpGeneration(): void
    {
        try {
            Cache::forever(self::GENERATION_KEY, self::generation() + 1);
        } catch (\Throwable $e) {
        }
    }

    /**
     * Stock moved outside the Product model (checkout, POS, cancellations,
     * claims): every list and that product's detail must be re-read.
     */
    public static function invalidateStock(?int $prodvarId = null): void
    {
        self::bumpGeneration();

        if ($prodvarId !== null) {
            try {
                $prodId = \App\Models\Prodvar::where('prodvar_id', $prodvarId)->value('prod_id');
                if ($prodId) Cache::forget(self::productDetailKey((int) $prodId));
            } catch (\Throwable $e) {
            }
        }
    }

    public static function productDetailKey(int $productId): string
    {
        return 'catalog:products:detail:' . $productId;
    }

    public static function categoriesKey(): string
    {
        return 'catalog:products:categories';
    }

    public static function supportsTagging(): bool
    {
        $store = Cache::getStore();

        return method_exists($store, 'tags');
    }

    public static function rememberList(?string $status, ?string $category, ?string $stock, callable $callback)
    {
        $key = self::productListKey($status, $category, $stock);

        if (self::supportsTagging()) {
            return Cache::tags(['catalog', 'products'])->remember($key, 1800, $callback);
        }

        return Cache::remember($key, 1800, $callback);
    }

    public static function rememberDetail(int $productId, callable $callback)
    {
        $key = self::productDetailKey($productId);

        if (self::supportsTagging()) {
            return Cache::tags(['catalog', 'products', 'product:' . $productId])->remember($key, 1800, $callback);
        }

        return Cache::remember($key, 1800, $callback);
    }

    public static function rememberCategories(callable $callback)
    {
        $key = self::categoriesKey();

        if (self::supportsTagging()) {
            return Cache::tags(['catalog', 'categories'])->remember($key, 1800, $callback);
        }

        return Cache::remember($key, 1800, $callback);
    }

    public static function invalidateProduct(int $productId): void
    {
        Cache::forget(self::productDetailKey($productId));
        Cache::forget(self::categoriesKey());
        self::bumpGeneration();
    }

    public static function invalidateCategory(): void
    {
        Cache::forget(self::categoriesKey());
        self::bumpGeneration();
    }
}
