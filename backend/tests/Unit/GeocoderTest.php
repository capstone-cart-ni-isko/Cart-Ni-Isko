<?php

namespace Tests\Unit;

use App\Services\Geocoder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeocoderTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.geocoder.spacing_ms' => 0, 'cache.default' => 'array']);
        Cache::flush();
    }

    public function test_the_address_is_cleaned_of_repeats_and_extra_addresses()
    {
        $this->assertSame(
            "148 Em's Barrio South, Legazpi City, Albay, 4500",
            Geocoder::clean("148 Em's Barrio South, Legazpi City, Em's Barrio South, Legazpi City, Albay, 4500 | Bicol University, Legazpi")
        );
    }

    public function test_the_search_walks_up_to_the_closest_place()
    {
        $this->assertSame([
            "148 Em's Barrio South, Legazpi City, Albay, 4500",
            "Em's Barrio South, Legazpi City, Albay",
            'Legazpi City, Albay',
        ], Geocoder::attempts("148 Em's Barrio South, Legazpi City, Albay, 4500"));
    }

    public function test_a_missed_street_falls_back_to_the_barangay_and_is_cached()
    {
        Http::fakeSequence('nominatim.openstreetmap.org/*')
            ->push([], 200)
            ->push([['lat' => '13.1423976', 'lon' => '123.7247484']], 200);

        $spot = (new Geocoder())->locate("148 Em's Barrio South, Legazpi City, Albay, 4500");

        $this->assertSame(13.1423976, $spot['lat']);
        $this->assertSame("Em's Barrio South, Legazpi City, Albay", $spot['matched']);

        // Cached: no further request on the second lookup.
        (new Geocoder())->locate("148 Em's Barrio South, Legazpi City, Albay, 4500");
        Http::assertSentCount(2);
    }

    public function test_nothing_found_returns_null()
    {
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([], 200)]);

        $this->assertNull((new Geocoder())->locate('Nowhere Street, Atlantis'));
    }
}
