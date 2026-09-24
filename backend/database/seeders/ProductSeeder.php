<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $jsonPath = base_path('../frontend/src/data/products.json');
        if (!file_exists($jsonPath)) {
            $this->command->error("products.json not found at: {$jsonPath}");
            return;
        }

        $items = json_decode(file_get_contents($jsonPath), true);
        if (!is_array($items)) {
            $this->command->error("Invalid JSON in products.json");
            return;
        }

        foreach ($items as $item) {
            $qty = $item['qty'] ?? 50;
            $colors = $item['colors'] ?? null;
            $images = $item['images'] ?? null;
            if (!$images && !empty($colors) && !empty($colors[0]['gallery'])) {
                $images = $colors[0]['gallery'];
            } elseif (!$images && !empty($colors) && !empty($colors[0]['image'])) {
                $images = [$colors[0]['image']];
            }

            Product::updateOrCreate(
                ['prod_tag' => $item['id']],
                [
                    'prod_created' => now(),
                    'prod_name' => $item['name'],
                    'prod_categ' => $item['category'] ?? 'OTHERS',
                    'prod_price' => $item['price'] ?? 0.00,
                    'prod_qty' => $qty,
                    'prod_desc' => $item['description'] ?? '',
                    'prod_peakqty' => $qty,
                    'prod_peaksold' => 0.00,
                    'prod_peakdate' => now(),
                    'prod_todayqty' => $qty,
                    'prod_todaysold' => 0.00,
                    'prod_sizes' => $item['sizes'] ?? null,
                    'prod_colors' => $colors,
                    'prod_images' => $images,
                    'prod_preorder' => $item['preOrder'] ?? false,
                    'prod_status' => $item['preOrder'] ? 'For Pre-order' : ($qty > 0 ? 'In Stock' : 'Out of Stock'),
                    'prod_details' => $item['details'] ?? null,
                    'prod_rating' => $item['rating'] ?? 5.0,
                    'prod_review_count' => $item['reviewCount'] ?? 0,
                    'prod_rating_breakdown' => $item['ratingBreakdown'] ?? null,
                    'prod_reviews' => $item['reviews'] ?? null,
                    'prod_stock_matrix' => $item['stockMatrix'] ?? null,
                ]
            );
        }

        $this->command->info("Successfully seeded " . count($items) . " products.");
    }
}
