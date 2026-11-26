import { useEffect, useRef, useState } from 'react';
import { LocateFixed, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CatalogInput } from '@/components/shared/CatalogInput';
import { loadProfileCatalog, nearestCatalogCity } from '@/data/profileCatalogs';

export function PostLocationField({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const requestId = useRef(0);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => () => { requestId.current++; }, []);
  useEffect(() => { if (disabled) { requestId.current++; setLocating(false); } }, [disabled]);

  function change(next: string) {
    requestId.current++;
    setLocating(false);
    setStatus('');
    onChange(next);
  }

  function useDeviceLocation() {
    const geo = navigator.geolocation;
    if (!geo) { setStatus('Device location isn’t available. You can still type a place.'); return; }
    const id = ++requestId.current;
    setLocating(true);
    setStatus('Finding a nearby city…');
    geo.getCurrentPosition(async ({ coords }) => {
      if (requestId.current !== id) return;
      const entries = await loadProfileCatalog('cities').catch(() => null);
      if (requestId.current !== id) return;
      const city = entries && nearestCatalogCity(entries, coords.latitude, coords.longitude);
      setLocating(false);
      if (!city) { setStatus('Couldn’t find a nearby city. You can still type a place.'); return; }
      onChange(city.label);
      setStatus('Nearby city filled in. You can edit it before posting.');
    }, error => {
      if (requestId.current !== id) return;
      setLocating(false);
      setStatus(error.code === 1 ? 'Location access wasn’t granted. You can still type a place.' : 'Couldn’t get your location. You can still type a place.');
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 });
  }

  return (
    <div className="space-y-1" data-testid="post-location-field">
      <CatalogInput kind="cities" label="Location (optional)" placeholder="Search a city or type a place" value={value} onChange={change} disabled={disabled} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-2" data-testid="use-device-location"
          onClick={useDeviceLocation} disabled={disabled || locating}>
          <LocateFixed className="size-4" aria-hidden="true" />Use my location
        </Button>
        {value && <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-2" onClick={() => change('')} disabled={disabled}>
          <X className="size-4" aria-hidden="true" />Clear location
        </Button>}
      </div>
      <p className="text-xs text-muted-foreground">Only the place name is shared, with the same audience as your post. City data: <a className="underline" href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.</p>
      {status && <p className="text-xs text-muted-foreground" role="status">{status}</p>}
    </div>
  );
}
