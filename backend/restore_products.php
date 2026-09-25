<?php
// One-off restore: rebuilds the `product` table from the committed
// frontend catalog (frontend/src/data/products.json). Idempotent:
// rows already present (e.g. after a backup restore) are skipped.
$pdo = new PDO("pgsql:host=aws-0-ap-northeast-1.pooler.supabase.com;port=5432;dbname=postgres;sslmode=require", "postgres.qxkxpyahmfdrhradnphw", "cartniisko2026");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$items = json_decode(file_get_contents(__DIR__ . "/../frontend/src/data/products.json"), true);
if (!is_array($items)) { fwrite(STDERR, "products.json unreadable\n"); exit(1); }

$exists = $pdo->prepare("select 1 from product where prod_tag = ?");
$insert = $pdo->prepare("
    insert into product (
        prod_tag, prod_name, prod_categ, prod_price, prod_qty, prod_desc,
        prod_sizes, prod_colors, prod_images, prod_preorder, prod_status,
        prod_preorder_info, prod_stock_matrix, prod_details,
        prod_rating, prod_review_count, prod_rating_breakdown, prod_reviews
    ) values (
        ?, ?, ?, ?, ?, ?,
        ?::json, ?::json, ?::json, ?, ?,
        ?::json, ?::json, ?::json,
        ?, ?, ?::json, ?::json
    )");

$added = 0;
foreach ($items as $p) {
    $exists->execute([$p['id']]);
    if ($exists->fetchColumn()) { echo "  skip (exists): {$p['name']}\n"; continue; }

    $qty = 0;
    foreach (($p['stockMatrix'] ?? []) as $colors) {
        foreach ($colors as $n) { $qty += (int) $n; }
    }

    $insert->execute([
        $p['id'], $p['name'], $p['category'] ?? 'OTHERS', $p['price'] ?? 0, $qty,
        $p['description'] ?? null,
        json_encode($p['sizes'] ?? []), json_encode($p['colors'] ?? []), json_encode($p['images'] ?? []),
        !empty($p['preOrder']) ? 1 : 0, $p['status'] ?? null,
        json_encode($p['preOrderInfo'] ?? null), json_encode($p['stockMatrix'] ?? null), json_encode($p['details'] ?? null),
        $p['rating'] ?? null, $p['reviewCount'] ?? 0, json_encode($p['ratingBreakdown'] ?? null), json_encode($p['reviews'] ?? []),
    ]);
    $added++;
    echo "  restored: {$p['name']} (qty $qty)\n";
}

$total = $pdo->query("select count(*) from product")->fetchColumn();
echo "inserted $added, product table now has $total rows\n";
