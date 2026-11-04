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

        return 'catalog:products:list:' . strtolower($status) . ':' . strtolower($category) . ':' . strtolower($stock);
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

        foreach (['active', 'disabled', 'deleted', 'all'] as $status) {
            Cache::forget(self::productListKey($status));
        }
    }

    public static function invalidateCategory(): void
    {
        Cache::forget(self::categoriesKey());

        foreach (['active', 'disabled', 'deleted', 'all'] as $status) {
            Cache::forget(self::productListKey($status));
        }
    }
}
