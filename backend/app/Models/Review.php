<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/**
 * DOMAIN 13 / DOMAIN 23 reviews.
 *
 * The schema carries no rating column, so the rating travels inside `rev_msg`
 * as a leading `<rating>|` token. ReviewsAPI encodes on write and decodes on
 * read; nothing else in the system ever touches `rev_msg` raw.
 */
class Review extends Model
{
    protected $table = 'reviews';
    protected $primaryKey = 'rev_id';
    public $timestamps = false;

    protected $fillable = [
        'cust_id',
        'prod_id',
        'rev_msg',
        'rev_created',
        'rev_approved',
    ];

    protected $casts = [
        'rev_created' => 'datetime',
        'rev_approved' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }

    /** Stores "<rating>|<message>". */
    public static function compose(int $rating, string $message): string
    {
        $rating = max(1, min(5, $rating));

        return $rating . '|' . $message;
    }

    /** The 1-5 rating carried by this review. */
    public function rating(): int
    {
        $raw = (string) $this->rev_msg;
        $head = explode('|', $raw, 2)[0];

        return is_numeric($head) ? max(1, min(5, (int) $head)) : 0;
    }

    /** The free-text half of the review. */
    public function text(): string
    {
        $raw = (string) $this->rev_msg;
        $parts = explode('|', $raw, 2);

        return count($parts) === 2 ? $parts[1] : $raw;
    }

    /** REQ-MANAGE_REV-02: only approved reviews reach customers. */
    public function isApproved(): bool
    {
        return $this->rev_approved !== null;
    }

    /** REQ-MANAGE_REV-03: rejected rows stay for audit under a marker. */
    public function isRejected(): bool
    {
        return $this->rev_approved === null && str_starts_with((string) $this->rev_msg, '[REJECTED]');
    }
}
