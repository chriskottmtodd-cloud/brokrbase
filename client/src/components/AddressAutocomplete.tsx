/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, CheckCircle2 } from "lucide-react";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Reuse the singleton loader from Map.tsx pattern
let _mapsLoadPromise: Promise<void> | null = null;
function loadMapScript(): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (_mapsLoadPromise) return _mapsLoadPromise;
  _mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src*="maps/api/js"]`
    );
    if (existing) {
      if (window.google?.maps) { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => { _mapsLoadPromise = null; reject(); });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { _mapsLoadPromise = null; reject(); };
    document.head.appendChild(script);
  });
  return _mapsLoadPromise;
}

export interface AddressComponents {
  address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected: (components: AddressComponents) => void;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder = "Start typing an address...",
  className,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [loading, setLoading] = useState(false);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    loadMapScript().then(() => {
      if (cancelled || !inputRef.current) return;
      setLoading(false);

      autocompleteRef.current = new google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ["address"],
          componentRestrictions: { country: "us" },
          fields: ["address_components", "formatted_address", "geometry"],
        }
      );

      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current!.getPlace();
        if (!place.address_components) return;

        const get = (type: string, short = false) => {
          const comp = place.address_components!.find((c) =>
            c.types.includes(type)
          );
          return comp ? (short ? comp.short_name : comp.long_name) : "";
        };

        const streetNumber = get("street_number");
        const route = get("route");
        const streetAddress = [streetNumber, route].filter(Boolean).join(" ");

        const components: AddressComponents = {
          address: streetAddress || place.formatted_address || "",
          city:
            get("locality") ||
            get("sublocality") ||
            get("postal_town") ||
            get("administrative_area_level_3"),
          county: get("administrative_area_level_2").replace(" County", ""),
          state: get("administrative_area_level_1", true),
          zip: get("postal_code"),
          latitude: place.geometry?.location?.lat() ?? null,
          longitude: place.geometry?.location?.lng() ?? null,
        };

        onChange(components.address);
        onPlaceSelected(components);
        setFilled(true);
      });
    }).catch(() => setLoading(false));

    return () => { cancelled = true; };
  }, []);

  // Reset filled indicator when value is cleared
  useEffect(() => {
    if (!value) setFilled(false);
  }, [value]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setFilled(false); }}
        placeholder={placeholder}
        className={`pl-9 pr-8 bg-background border-border ${className ?? ""}`}
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {!loading && filled && <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
      </div>
    </div>
  );
}
