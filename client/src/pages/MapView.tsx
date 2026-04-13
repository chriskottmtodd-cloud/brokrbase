import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  Building2,
  Calendar,
  Crosshair,
  Edit2,
  Info,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import {
  ALL_PROPERTY_TYPES,
  getEnabledTypes,
  getTypeColor,
  parsePreferences,
  type UserPreferences,
} from "./Settings";

// ─── Google Maps script loader (singleton) ─────────────────────────────────
let mapsLoadPromise: Promise<typeof google.maps> | null = null;
function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("No window"));
      return;
    }
    if ((window as unknown as { google?: { maps?: typeof google.maps } }).google?.maps) {
      resolve((window as unknown as { google: { maps: typeof google.maps } }).google.maps);
      return;
    }
    const callbackName = `__brokrbaseMapsLoad_${Date.now()}`;
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      resolve((window as unknown as { google: { maps: typeof google.maps } }).google.maps);
      delete (window as unknown as Record<string, () => void>)[callbackName];
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=drawing,geometry&callback=${callbackName}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

interface MapProperty {
  id: number;
  name: string;
  propertyType: string;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  boundary: string | null;
  unitCount: number | null;
  vintageYear: number | null;
  sizeSqft: number | null;
  lotAcres: number | null;
  estimatedValue: number | null;
  askingPrice: number | null;
  capRate: number | null;
  noi: number | null;
  primaryTenant: string | null;
  leaseType: string | null;
  leaseExpiration: Date | string | null;
  notes: string | null;
  ownerName: string | null;
  ownerCompany: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
}

export default function MapView() {
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const polygonsRef = useRef<Map<number, google.maps.Polygon>>(new Map());

  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<MapProperty | null>(null);

  // ─── Data ─────────────────────────────────────────────────────────────────
  const configQuery = trpc.properties.mapsConfig.useQuery();
  const profileQuery = trpc.users.getMyProfile.useQuery();
  const prefs: UserPreferences = parsePreferences(profileQuery.data?.preferences ?? "");
  const enabledTypes = getEnabledTypes(prefs);
  const enabledPropertyTypeOptions = ALL_PROPERTY_TYPES.filter((t) =>
    enabledTypes.includes(t.value),
  );
  const firstEnabledType = enabledPropertyTypeOptions[0]?.value ?? "apartment";

  // After-draw "Name this property" modal state
  const [pendingPolygon, setPendingPolygon] = useState<google.maps.Polygon | null>(null);
  const [pendingCenter, setPendingCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [newPropertyForm, setNewPropertyForm] = useState({
    name: "",
    propertyType: firstEnabledType as string,
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  // Drop-pin mode
  const [droppingPin, setDroppingPin] = useState(false);
  const droppingPinRef = useRef(false);
  const pendingMarkerRef = useRef<google.maps.Marker | null>(null);

  // Custom drawing mode (replaces Google DrawingManager for better mobile UX)
  const [isCustomDrawing, setIsCustomDrawing] = useState(false);
  const isCustomDrawingRef = useRef(false);
  const drawVerticesRef = useRef<google.maps.Marker[]>([]);
  const drawPolylineRef = useRef<google.maps.Polyline | null>(null);
  const drawPointsRef = useRef<google.maps.LatLng[]>([]);

  // Edit-boundary mode for an existing property
  const [editingPropertyId, setEditingPropertyId] = useState<number | null>(null);
  // Draw-boundary mode for an existing property that has no boundary yet
  const [drawingForPropertyId, setDrawingForPropertyId] = useState<number | null>(null);
  const drawingForPropertyIdRef = useRef<number | null>(null);
  const propertiesQuery = trpc.properties.forMap.useQuery();
  const utils = trpc.useUtils();
  const createProperty = trpc.properties.create.useMutation();
  const updateProperty = trpc.properties.update.useMutation();
  const deleteProperty = trpc.properties.delete.useMutation();

  const properties = (propertiesQuery.data ?? []) as MapProperty[];

  // Detail-card data: activities + tasks for the selected property
  const activitiesQuery = trpc.activities.list.useQuery(
    { propertyId: selectedProperty?.id ?? 0, limit: 5 },
    { enabled: !!selectedProperty?.id },
  );
  const tasksQuery = trpc.tasks.list.useQuery(
    { propertyId: selectedProperty?.id ?? 0, status: "pending" },
    { enabled: !!selectedProperty?.id },
  );
  const linkedContactsQuery = trpc.contactLinks.listForProperty.useQuery(
    { propertyId: selectedProperty?.id ?? 0 },
    { enabled: !!selectedProperty?.id },
  );

  // ─── Map initialization (runs once when API key + container ready) ─────────
  useEffect(() => {
    if (!configQuery.data?.apiKey) return;
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialized

    let cancelled = false;
    loadGoogleMaps(configQuery.data.apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;

        // Check URL params for a specific location to center on
        const params = new URLSearchParams(window.location.search);
        const paramLat = parseFloat(params.get("lat") ?? "");
        const paramLng = parseFloat(params.get("lng") ?? "");
        const paramZoom = parseInt(params.get("zoom") ?? "");
        const hasUrlCenter = !isNaN(paramLat) && !isNaN(paramLng);

        // Restore last map position from session
        const saved = sessionStorage.getItem("brokrbase-map-pos");
        const savedPos = saved ? JSON.parse(saved) : null;
        const hasSaved = savedPos && !isNaN(savedPos.lat) && !isNaN(savedPos.lng);

        const defaultCenter = hasUrlCenter
          ? { lat: paramLat, lng: paramLng }
          : hasSaved
            ? { lat: savedPos.lat, lng: savedPos.lng }
            : { lat: 43.615, lng: -116.2023 }; // Boise, ID
        const defaultZoom = hasUrlCenter ? (paramZoom || 16) : hasSaved ? savedPos.zoom : 14;

        const map = new maps.Map(containerRef.current, {
          center: defaultCenter,
          zoom: defaultZoom,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy", // single-finger pan on mobile
          mapTypeId: maps.MapTypeId.HYBRID,
          tilt: 0,
          rotateControl: false,
        });
        mapRef.current = map;

        // Save position whenever map moves
        map.addListener("idle", () => {
          const c = map.getCenter();
          if (c) {
            sessionStorage.setItem("brokrbase-map-pos", JSON.stringify({
              lat: c.lat(),
              lng: c.lng(),
              zoom: map.getZoom(),
            }));
          }
        });

        // Center on user's location if they grant permission (skip if URL had coords or saved position)
        if (!hasUrlCenter && !hasSaved && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              map.setZoom(14);
            },
            () => {
              // Permission denied or unavailable — stay on default
            },
            { timeout: 5000, maximumAge: 60_000 },
          );
        }

        // Drawing manager for polygons
        const drawingManager = new maps.drawing.DrawingManager({
          drawingMode: null, // off by default
          drawingControl: false, // we use our own button
          polygonOptions: {
            fillColor: "#d03238",
            fillOpacity: 0.25,
            strokeColor: "#d03238",
            strokeWeight: 2,
            clickable: true,
            editable: false,
            zIndex: 1,
          },
        });
        drawingManager.setMap(map);
        drawingManagerRef.current = drawingManager;

        // Listen for completed polygon draws
        maps.event.addListener(
          drawingManager,
          "polygoncomplete",
          (polygon: google.maps.Polygon) => {
            // Calculate centroid for the pin location
            const path = polygon.getPath();
            let latSum = 0;
            let lngSum = 0;
            const len = path.getLength();
            for (let i = 0; i < len; i++) {
              const pt = path.getAt(i);
              latSum += pt.lat();
              lngSum += pt.lng();
            }
            const centroid = { lat: latSum / len, lng: lngSum / len };

            // Stop drawing mode after each polygon
            drawingManager.setDrawingMode(null);

            // If drawing for an existing property, save boundary directly
            const existingId = drawingForPropertyIdRef.current;
            if (existingId) {
              const pathArr = polygon.getPath();
              const ring: number[][] = [];
              for (let i = 0; i < pathArr.getLength(); i++) {
                const pt = pathArr.getAt(i);
                ring.push([pt.lng(), pt.lat()]);
              }
              if (ring.length > 0) ring.push(ring[0]);
              const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });

              polygon.setMap(null);
              drawingForPropertyIdRef.current = null;
              setDrawingForPropertyId(null);

              // Save via mutation
              updateProperty.mutateAsync({
                id: existingId,
                data: { boundary: geojson, latitude: centroid.lat, longitude: centroid.lng },
              }).then(() => {
                toast.success("Boundary saved");
                utils.properties.forMap.invalidate();
              }).catch(() => {
                toast.error("Failed to save boundary");
              });
              return;
            }

            setPendingPolygon(polygon);
            setPendingCenter(centroid);
            setShowNameModal(true);

            // Reverse-geocode centroid to auto-fill address fields
            setGeocoding(true);
            const geocoder = new maps.Geocoder();
            geocoder.geocode({ location: centroid }, (results, status) => {
              setGeocoding(false);
              if (status !== "OK" || !results?.[0]) return;
              const components = results[0].address_components;
              const get = (type: string) =>
                components.find((c) => c.types.includes(type))?.short_name ?? "";
              const streetNumber = get("street_number");
              const route = get("route");
              const addr = [streetNumber, route].filter(Boolean).join(" ");
              setNewPropertyForm((prev) => ({
                ...prev,
                address: addr,
                city: get("locality") || get("sublocality") || get("neighborhood"),
                state: get("administrative_area_level_1"),
                zip: get("postal_code"),
              }));
            });
          },
        );

        // Click handler for drop-pin AND custom drawing
        maps.event.addListener(map, "click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;

          // Custom boundary drawing mode
          if (isCustomDrawingRef.current) {
            const pt = e.latLng;
            drawPointsRef.current.push(pt);

            // Place a visible vertex marker
            const vertexMarker = new maps.Marker({
              position: pt,
              map,
              icon: {
                path: maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#d03238",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              },
              zIndex: 100,
            });
            drawVerticesRef.current.push(vertexMarker);

            // Update polyline to show progress
            if (drawPolylineRef.current) {
              drawPolylineRef.current.setPath(drawPointsRef.current);
            } else {
              drawPolylineRef.current = new maps.Polyline({
                path: drawPointsRef.current,
                map,
                strokeColor: "#d03238",
                strokeWeight: 2,
                strokeOpacity: 0.8,
              });
            }
            return;
          }

          // Drop pin mode
          if (!droppingPinRef.current) return;

          if (pendingMarkerRef.current) {
            pendingMarkerRef.current.setMap(null);
          }

          const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };

          const marker = new maps.Marker({
            position: pos,
            map,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#d03238",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
          pendingMarkerRef.current = marker;

          setPendingCenter(pos);
          setShowNameModal(true);
          setDroppingPin(false);
          droppingPinRef.current = false;

          // Reverse-geocode
          setGeocoding(true);
          const geocoder = new maps.Geocoder();
          geocoder.geocode({ location: pos }, (results, status) => {
            setGeocoding(false);
            if (status !== "OK" || !results?.[0]) return;
            const components = results[0].address_components;
            const get = (type: string) =>
              components.find((c) => c.types.includes(type))?.short_name ?? "";
            const streetNumber = get("street_number");
            const route = get("route");
            const addr = [streetNumber, route].filter(Boolean).join(" ");
            setNewPropertyForm((prev) => ({
              ...prev,
              address: addr,
              city: get("locality") || get("sublocality") || get("neighborhood"),
              state: get("administrative_area_level_1"),
              zip: get("postal_code"),
            }));
          });
        });

        setMapsReady(true);
      })
      .catch((err) => {
        console.error(err);
        setMapsError(err instanceof Error ? err.message : "Failed to load Google Maps");
      });

    return () => {
      cancelled = true;
    };
  }, [configQuery.data?.apiKey]);

  // ─── Render markers + polygons whenever properties change ─────────────────
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;
    const map = mapRef.current;

    // Clear existing markers/polygons that no longer match a property
    const propertyIds = new Set(properties.map((p) => p.id));
    markersRef.current.forEach((marker, id) => {
      if (!propertyIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });
    polygonsRef.current.forEach((polygon, id) => {
      if (!propertyIds.has(id)) {
        polygon.setMap(null);
        polygonsRef.current.delete(id);
      }
    });

    // Render or update markers/polygons for each property
    for (const p of properties) {
      const color = getTypeColor(prefs, p.propertyType);

      if (p.latitude != null && p.longitude != null) {
        let marker = markersRef.current.get(p.id);
        if (!marker) {
          marker = new maps.Marker({
            position: { lat: p.latitude, lng: p.longitude },
            map,
            title: p.name,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
          marker.addListener("click", () => {
            setSelectedProperty(p);
          });
          markersRef.current.set(p.id, marker);
        } else {
          marker.setPosition({ lat: p.latitude, lng: p.longitude });
          marker.setIcon({
            path: maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          });
        }
      }

      // Polygon (boundary) — render if the property has one
      if (p.boundary) {
        try {
          const geojson = JSON.parse(p.boundary) as { coordinates: number[][][] };
          const ring = geojson.coordinates?.[0] ?? [];
          const path = ring.map(([lng, lat]) => ({ lat, lng }));

          let polygon = polygonsRef.current.get(p.id);
          if (!polygon) {
            polygon = new maps.Polygon({
              paths: path,
              fillColor: color,
              fillOpacity: 0.2,
              strokeColor: color,
              strokeWeight: 2,
              clickable: true,
              editable: false,
              zIndex: 0,
            });
            polygon.setMap(map);
            polygon.addListener("click", () => {
              setSelectedProperty(p);
            });
            polygonsRef.current.set(p.id, polygon);
          } else {
            polygon.setPath(path);
            polygon.setOptions({
              fillColor: color,
              strokeColor: color,
              editable: editingPropertyId === p.id,
            });
          }
        } catch (err) {
          console.warn("Bad boundary JSON for property", p.id, err);
        }
      } else {
        // Property used to have a polygon but doesn't anymore — remove it
        const existing = polygonsRef.current.get(p.id);
        if (existing) {
          existing.setMap(null);
          polygonsRef.current.delete(p.id);
        }
      }
    }
  }, [properties, mapsReady, editingPropertyId]);

  // ─── Drawing controls ─────────────────────────────────────────────────────
  const startDrawing = () => {
    if (!window.google?.maps) return;
    isCustomDrawingRef.current = true;
    setIsCustomDrawing(true);
    drawPointsRef.current = [];
    toast.info("Tap points around the property. Hit 'Finish' when done.");
  };

  const cleanupCustomDrawing = () => {
    drawVerticesRef.current.forEach((m) => m.setMap(null));
    drawVerticesRef.current = [];
    if (drawPolylineRef.current) {
      drawPolylineRef.current.setMap(null);
      drawPolylineRef.current = null;
    }
    drawPointsRef.current = [];
    isCustomDrawingRef.current = false;
    setIsCustomDrawing(false);
  };

  const finishCustomDrawing = () => {
    const points = drawPointsRef.current;
    if (points.length < 3) {
      toast.error("Need at least 3 points to make a boundary");
      return;
    }

    // Build polygon from collected points
    const maps = window.google?.maps;
    if (!maps || !mapRef.current) return;

    const polygon = new maps.Polygon({
      paths: points,
      fillColor: "#d03238",
      fillOpacity: 0.25,
      strokeColor: "#d03238",
      strokeWeight: 2,
      map: mapRef.current,
    });

    // Calculate centroid
    let latSum = 0, lngSum = 0;
    for (const pt of points) {
      latSum += pt.lat();
      lngSum += pt.lng();
    }
    const centroid = { lat: latSum / points.length, lng: lngSum / points.length };

    // Clean up drawing UI
    cleanupCustomDrawing();

    // Check if drawing for existing property
    const existingId = drawingForPropertyIdRef.current;
    if (existingId) {
      const ring: number[][] = points.map((pt) => [pt.lng(), pt.lat()]);
      ring.push(ring[0]);
      const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });

      polygon.setMap(null);
      drawingForPropertyIdRef.current = null;
      setDrawingForPropertyId(null);

      updateProperty.mutateAsync({
        id: existingId,
        data: { boundary: geojson, latitude: centroid.lat, longitude: centroid.lng },
      }).then(() => {
        toast.success("Boundary saved");
        utils.properties.forMap.invalidate();
      }).catch(() => {
        toast.error("Failed to save boundary");
      });
      return;
    }

    // New property — show name modal
    setPendingPolygon(polygon);
    setPendingCenter(centroid);
    setShowNameModal(true);

    // Reverse-geocode
    setGeocoding(true);
    const geocoder = new maps.Geocoder();
    geocoder.geocode({ location: centroid }, (results, status) => {
      setGeocoding(false);
      if (status !== "OK" || !results?.[0]) return;
      const components = results[0].address_components;
      const get = (type: string) =>
        components.find((c) => c.types.includes(type))?.short_name ?? "";
      const streetNumber = get("street_number");
      const route = get("route");
      const addr = [streetNumber, route].filter(Boolean).join(" ");
      setNewPropertyForm((prev) => ({
        ...prev,
        address: addr,
        city: get("locality") || get("sublocality") || get("neighborhood"),
        state: get("administrative_area_level_1"),
        zip: get("postal_code"),
      }));
    });
  };

  const cancelDrawing = () => {
    if (drawingManagerRef.current) drawingManagerRef.current.setDrawingMode(null);
    cleanupCustomDrawing();
    if (pendingPolygon) {
      pendingPolygon.setMap(null);
      setPendingPolygon(null);
    }
    if (pendingMarkerRef.current) {
      pendingMarkerRef.current.setMap(null);
      pendingMarkerRef.current = null;
    }
    setPendingCenter(null);
    setShowNameModal(false);
    setDroppingPin(false);
    droppingPinRef.current = false;
    drawingForPropertyIdRef.current = null;
    setDrawingForPropertyId(null);
    setNewPropertyForm({ name: "", propertyType: firstEnabledType, address: "", city: "", state: "", zip: "" });
  };

  const recenterOnMe = () => {
    if (!mapRef.current) return;
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser");
      return;
    }
    toast.info("Getting your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(18);
        toast.dismiss();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Location access denied. Allow location in your browser settings.");
        } else if (err.code === err.TIMEOUT) {
          toast.error("Location request timed out. Try again.");
        } else {
          toast.error("Couldn't get your location");
        }
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  // ─── Save a newly-drawn property ─────────────────────────────────────────
  const handleSaveNewProperty = async () => {
    if (!pendingCenter) return;
    if (!newPropertyForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    // Convert the polygon to GeoJSON if one exists
    let geojson: string | undefined;
    if (pendingPolygon) {
      const path = pendingPolygon.getPath();
      const ring: number[][] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const pt = path.getAt(i);
        ring.push([pt.lng(), pt.lat()]);
      }
      if (ring.length > 0) ring.push(ring[0]);
      geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });
    }

    try {
      await createProperty.mutateAsync({
        name: newPropertyForm.name,
        propertyType: newPropertyForm.propertyType as
          | "apartment" | "mhc" | "office" | "retail" | "industrial"
          | "self_storage" | "affordable_housing" | "other",
        address: newPropertyForm.address || undefined,
        city: newPropertyForm.city || undefined,
        state: newPropertyForm.state || undefined,
        zip: newPropertyForm.zip || undefined,
        latitude: pendingCenter.lat,
        longitude: pendingCenter.lng,
        boundary: geojson,
      });
      toast.success(`Added ${newPropertyForm.name}`);

      // Clean up temporary markers/polygons
      if (pendingPolygon) {
        pendingPolygon.setMap(null);
        setPendingPolygon(null);
      }
      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.setMap(null);
        pendingMarkerRef.current = null;
      }
      setPendingCenter(null);
      setShowNameModal(false);
      setNewPropertyForm({ name: "", propertyType: firstEnabledType, address: "", city: "", state: "", zip: "" });
      utils.properties.forMap.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save property");
    }
  };

  // ─── Edit existing polygon ────────────────────────────────────────────────
  const startEditBoundary = (propertyId: number) => {
    setEditingPropertyId(propertyId);
    toast.info("Drag the corner handles to reshape. Click 'Save boundary' when done.");
  };

  const saveEditedBoundary = async () => {
    if (!editingPropertyId) return;
    const polygon = polygonsRef.current.get(editingPropertyId);
    if (!polygon) return;

    const path = polygon.getPath();
    const ring: number[][] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const pt = path.getAt(i);
      ring.push([pt.lng(), pt.lat()]);
    }
    if (ring.length > 0) ring.push(ring[0]);
    const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });

    // Recompute centroid for the pin
    let latSum = 0, lngSum = 0;
    const len = path.getLength();
    for (let i = 0; i < len; i++) {
      const pt = path.getAt(i);
      latSum += pt.lat();
      lngSum += pt.lng();
    }
    const centroid = { lat: latSum / len, lng: lngSum / len };

    try {
      await updateProperty.mutateAsync({
        id: editingPropertyId,
        data: {
          boundary: geojson,
          latitude: centroid.lat,
          longitude: centroid.lng,
        },
      });
      toast.success("Boundary updated");
      setEditingPropertyId(null);
      utils.properties.forMap.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save boundary");
    }
  };

  const cancelEditBoundary = () => {
    setEditingPropertyId(null);
    utils.properties.forMap.invalidate(); // re-render from DB to revert visual edits
  };

  const handleDeleteProperty = async () => {
    if (!selectedProperty) return;
    if (!confirm(`Delete ${selectedProperty.name}? This can't be undone.`)) return;
    try {
      await deleteProperty.mutateAsync({ id: selectedProperty.id });
      toast.success("Deleted");
      setSelectedProperty(null);
      utils.properties.forMap.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleRemoveBoundaryOnly = async () => {
    if (!selectedProperty) return;
    try {
      await updateProperty.mutateAsync({
        id: selectedProperty.id,
        data: { boundary: null },
      });
      toast.success("Boundary removed");
      utils.properties.forMap.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!configQuery.data?.apiKey) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="border border-yellow-300 bg-yellow-50 rounded-md p-4">
          <h2 className="font-semibold text-yellow-900 mb-1">Map not configured</h2>
          <p className="text-sm text-yellow-800">
            Brokrbase needs a Google Maps API key. The admin needs to add{" "}
            <code className="bg-yellow-100 px-1 rounded">GOOGLE_MAPS_API_KEY</code> to the
            server's environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      {/* The map fills the screen */}
      <div ref={containerRef} className="absolute inset-0 bg-muted" />

      {mapsError && (
        <div className="absolute top-4 left-4 right-4 z-10 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-900">
          {mapsError}
        </div>
      )}

      {/* Top controls — drawing + recenter */}
      <div className="absolute top-14 left-4 z-10 flex gap-2">
        {!editingPropertyId && !drawingForPropertyId && !droppingPin && !isCustomDrawing && (
          <>
            <Button
              onClick={() => {
                setDroppingPin(true);
                droppingPinRef.current = true;
                toast.info("Tap anywhere on the map to drop a pin.");
              }}
              disabled={!mapsReady}
              variant="outline"
              className="gap-2 shadow-lg bg-white"
              size="sm"
            >
              <MapPin className="h-4 w-4" /> Drop Pin
            </Button>
            <Button
              onClick={startDrawing}
              disabled={!mapsReady}
              className="gap-2 shadow-lg"
              size="sm"
            >
              <Plus className="h-4 w-4" /> Draw Boundary
            </Button>
          </>
        )}
        {(isCustomDrawing || drawingForPropertyId) && (
          <>
            <Button
              onClick={finishCustomDrawing}
              className="gap-2 shadow-lg"
              size="sm"
            >
              Finish
            </Button>
            <Button
              onClick={cancelDrawing}
              variant="outline"
              className="shadow-lg bg-white"
              size="sm"
            >
              Cancel
            </Button>
            <span className="text-xs text-white bg-black/50 px-2 py-1 rounded-full shadow">
              {drawPointsRef.current.length} points
            </span>
          </>
        )}
        {droppingPin && (
          <Button
            onClick={() => {
              setDroppingPin(false);
              droppingPinRef.current = false;
            }}
            variant="outline"
            className="shadow-lg bg-white"
            size="sm"
          >
            Cancel
          </Button>
        )}
        {editingPropertyId && (
          <>
            <Button onClick={saveEditedBoundary} className="gap-2 shadow-lg" size="sm">
              <Pencil className="h-4 w-4" /> Save Boundary
            </Button>
            <Button onClick={cancelEditBoundary} variant="outline" className="shadow-lg" size="sm">
              Cancel
            </Button>
          </>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          onClick={recenterOnMe}
          variant="outline"
          size="icon"
          className="shadow-lg bg-white"
          title="Center on my location"
        >
          <Crosshair className="h-4 w-4" />
        </Button>
      </div>

      {/* Help banner during drawing */}
      {(pendingPolygon || editingPropertyId) && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-3 py-1.5 rounded-full shadow-lg text-xs flex items-center gap-1.5 max-w-[90%]">
          <Info className="h-3 w-3" />
          {editingPropertyId
            ? "Drag the corner handles to reshape, then tap Save"
            : "Tap points around the property, then tap the first point to close"}
        </div>
      )}

      {/* Loading overlay */}
      {!mapsReady && !mapsError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
          <div className="bg-white rounded-lg shadow-lg p-4 flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Loading map…</span>
          </div>
        </div>
      )}

      {/* Property card — slides in from the right (or bottom on mobile) */}
      {selectedProperty && (
        <PropertyCard
          property={selectedProperty}
          activities={activitiesQuery.data ?? []}
          tasks={tasksQuery.data ?? []}
          linkedContacts={linkedContactsQuery.data ?? []}
          onClose={() => setSelectedProperty(null)}
          onEditFull={() => setLocation(`/properties/${selectedProperty.id}`)}
          onEditBoundary={() => {
            if (selectedProperty.boundary) {
              startEditBoundary(selectedProperty.id);
            } else {
              // No boundary yet — start custom drawing mode for this property
              drawingForPropertyIdRef.current = selectedProperty.id;
              setDrawingForPropertyId(selectedProperty.id);
              isCustomDrawingRef.current = true;
              setIsCustomDrawing(true);
              drawPointsRef.current = [];
              toast.info("Tap points around the property. Hit 'Finish' when done.");
            }
            setSelectedProperty(null);
          }}
          onRemoveBoundary={handleRemoveBoundaryOnly}
          onDelete={handleDeleteProperty}
          hasBoundary={!!selectedProperty.boundary}
          prefs={prefs}
        />
      )}

      {/* Name-this-property modal after a polygon is drawn */}
      <Dialog open={showNameModal} onOpenChange={(o) => !o && cancelDrawing()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Name this property</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Property name *</Label>
              <Input
                autoFocus
                value={newPropertyForm.name}
                onChange={(e) => setNewPropertyForm({ ...newPropertyForm, name: e.target.value })}
                placeholder="e.g. Pinecreek Apartments"
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select
                value={newPropertyForm.propertyType}
                onValueChange={(v) => setNewPropertyForm({ ...newPropertyForm, propertyType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {enabledPropertyTypeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                Address{geocoding ? <span className="ml-1 text-muted-foreground">(detecting...)</span> : ""}
              </Label>
              <Input
                value={newPropertyForm.address}
                onChange={(e) => setNewPropertyForm({ ...newPropertyForm, address: e.target.value })}
                placeholder={geocoding ? "Looking up address…" : "123 Main St"}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Label className="text-xs">City</Label>
                <Input
                  value={newPropertyForm.city}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input
                  value={newPropertyForm.state}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, state: e.target.value })}
                  placeholder="ST"
                />
              </div>
              <div>
                <Label className="text-xs">Zip</Label>
                <Input
                  value={newPropertyForm.zip}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, zip: e.target.value })}
                  placeholder="Zip"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDrawing}>
              Cancel
            </Button>
            <Button onClick={handleSaveNewProperty} disabled={createProperty.isPending}>
              {createProperty.isPending ? "Saving…" : "Save Property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Property card (slides in from corner) ─────────────────────────────────
function PropertyCard({
  property,
  activities,
  tasks,
  linkedContacts,
  onClose,
  onEditFull,
  onEditBoundary,
  onRemoveBoundary,
  onDelete,
  hasBoundary,
  prefs,
}: {
  property: MapProperty;
  activities: Array<{ id: number; type: string; subject: string | null; notes: string | null; summary: string | null; occurredAt: Date | string }>;
  tasks: Array<{ id: number; title: string; dueAt: Date | string | null; priority: string }>;
  linkedContacts: Array<{ id: number; contactId: number; firstName: string; lastName: string; company: string | null; dealRole: string | null }>;
  onClose: () => void;
  onEditFull: () => void;
  onEditBoundary: () => void;
  onRemoveBoundary: () => void;
  onDelete: () => void;
  hasBoundary: boolean;
  prefs: UserPreferences;
}) {
  const fullAddress = [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ");
  const typeColor = getTypeColor(prefs, property.propertyType);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(property.notes ?? "");
  const utils = trpc.useUtils();
  const updateNotes = trpc.properties.update.useMutation({
    onSuccess: async () => {
      toast.success("Notes saved");
      setEditingNotes(false);
      // Wait for cache refresh so clicking away and back shows updated notes
      await utils.properties.forMap.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div
      className="absolute z-20 bg-white rounded-lg shadow-2xl overflow-y-auto
                 right-4 top-4 bottom-4 w-[360px] max-w-[calc(100vw-2rem)]
                 sm:right-4 sm:top-4 sm:bottom-4 sm:w-[360px]
                 max-sm:left-2 max-sm:right-2 max-sm:top-auto max-sm:bottom-2 max-sm:w-auto max-sm:max-h-[60vh]"
    >
      {/* Header */}
      <div className="sticky top-0 bg-white border-b z-10 p-3 flex items-start gap-2">
        <div
          className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: typeColor + "22", color: typeColor }}
        >
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-base truncate">{property.name}</h2>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] capitalize">
              {property.propertyType.replace("_", " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {property.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 space-y-3 text-sm">
        {fullAddress && (
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{fullAddress}</span>
          </div>
        )}

        {/* Property details — show whatever is filled in */}
        {(property.unitCount || property.vintageYear || property.sizeSqft || property.lotAcres || property.estimatedValue || property.askingPrice || property.capRate || property.noi) && (
          <div className="grid grid-cols-2 gap-2 text-xs border-y py-2">
            {property.unitCount != null && (
              <div>
                <div className="text-muted-foreground">Units</div>
                <div className="font-medium">{property.unitCount}</div>
              </div>
            )}
            {property.vintageYear != null && (
              <div>
                <div className="text-muted-foreground">Year Built</div>
                <div className="font-medium">{property.vintageYear}</div>
              </div>
            )}
            {property.sizeSqft != null && (
              <div>
                <div className="text-muted-foreground">Size</div>
                <div className="font-medium">{property.sizeSqft.toLocaleString()} sqft</div>
              </div>
            )}
            {property.lotAcres != null && (
              <div>
                <div className="text-muted-foreground">Lot</div>
                <div className="font-medium">{property.lotAcres} acres</div>
              </div>
            )}
            {property.estimatedValue != null && (
              <div>
                <div className="text-muted-foreground">Est. Value</div>
                <div className="font-medium">${property.estimatedValue >= 1000000 ? (property.estimatedValue / 1000000).toFixed(2) + "M" : property.estimatedValue.toLocaleString()}</div>
              </div>
            )}
            {property.askingPrice != null && (
              <div>
                <div className="text-muted-foreground">Asking</div>
                <div className="font-medium">${property.askingPrice >= 1000000 ? (property.askingPrice / 1000000).toFixed(2) + "M" : property.askingPrice.toLocaleString()}</div>
              </div>
            )}
            {property.capRate != null && (
              <div>
                <div className="text-muted-foreground">Cap Rate</div>
                <div className="font-medium">{property.capRate}%</div>
              </div>
            )}
            {property.noi != null && (
              <div>
                <div className="text-muted-foreground">NOI</div>
                <div className="font-medium">${property.noi.toLocaleString()}</div>
              </div>
            )}
          </div>
        )}

        {/* Lease fields for office/retail/industrial */}
        {["office", "retail", "industrial"].includes(property.propertyType) &&
          (property.primaryTenant || property.leaseType || property.leaseExpiration) && (
          <div className="grid grid-cols-2 gap-2 text-xs border-y py-2">
            {property.primaryTenant && (
              <div className="col-span-2">
                <div className="text-muted-foreground">Tenant</div>
                <div className="font-medium">{property.primaryTenant}</div>
              </div>
            )}
            {property.leaseType && (
              <div>
                <div className="text-muted-foreground">Lease Type</div>
                <div className="font-medium">{property.leaseType}</div>
              </div>
            )}
            {property.leaseExpiration && (
              <div>
                <div className="text-muted-foreground">Lease Exp.</div>
                <div className="font-medium">{new Date(property.leaseExpiration).toLocaleDateString()}</div>
              </div>
            )}
          </div>
        )}

        {/* Notes — tap to edit */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</div>
          {editingNotes ? (
            <div className="space-y-1.5">
              <Textarea
                rows={5}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                className="text-sm"
                autoFocus
                onFocus={(e) => {
                  // Move cursor to end on iOS
                  const val = e.target.value;
                  e.target.value = "";
                  e.target.value = val;
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-9 text-sm flex-1"
                  disabled={updateNotes.isPending}
                  onClick={() => {
                    updateNotes.mutate({
                      id: property.id,
                      data: { notes: notesText || null },
                    });
                  }}
                >
                  {updateNotes.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-sm"
                  onClick={() => setEditingNotes(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="border rounded-md p-3 text-sm whitespace-pre-wrap bg-muted/20 min-h-[44px] cursor-text active:bg-muted/40"
              onClick={() => {
                setNotesText(property.notes ?? "");
                setEditingNotes(true);
              }}
            >
              {property.notes || <span className="text-muted-foreground italic">Tap to add notes...</span>}
            </div>
          )}
        </div>

        {/* Owner */}
        {(property.ownerName || property.ownerCompany) && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <UserIcon className="h-3 w-3" /> Owner
            </div>
            <div className="border rounded-md p-2 space-y-1">
              {property.ownerName && <div className="font-medium">{property.ownerName}</div>}
              {property.ownerCompany && (
                <div className="text-xs text-muted-foreground">{property.ownerCompany}</div>
              )}
              {property.ownerPhone && (
                <div className="text-xs flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <a href={`tel:${property.ownerPhone}`} className="hover:underline">
                    {property.ownerPhone}
                  </a>
                </div>
              )}
              {property.ownerEmail && (
                <div className="text-xs flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <a href={`mailto:${property.ownerEmail}`} className="hover:underline truncate">
                    {property.ownerEmail}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Linked contacts (owners, tenants, etc.) */}
        {linkedContacts.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <UserIcon className="h-3 w-3" /> People
            </div>
            <div className="space-y-1">
              {linkedContacts.map((c) => (
                <div key={c.id} className="border rounded-md p-1.5 text-xs flex items-center gap-1.5">
                  <span className="font-medium">{c.firstName} {c.lastName}</span>
                  {c.dealRole && (
                    <Badge variant="outline" className="text-[9px] capitalize">
                      {c.dealRole.replace("_", " ")}
                    </Badge>
                  )}
                  {c.company && <span className="text-muted-foreground ml-auto truncate">{c.company}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent activities */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <ActivityIcon className="h-3 w-3" /> Recent Activity
          </div>
          {activities.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No activities logged yet</p>
          ) : (
            <div className="space-y-1">
              {activities.map((a) => (
                <div key={a.id} className="border rounded-md p-1.5 text-xs">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] capitalize">
                      {a.type}
                    </Badge>
                    <span className="text-muted-foreground ml-auto text-[10px]">
                      {formatDistanceToNow(new Date(a.occurredAt), { addSuffix: true })}
                    </span>
                  </div>
                  {a.subject && <div className="font-medium mt-0.5 line-clamp-1">{a.subject}</div>}
                  {(a.summary || a.notes) && (
                    <div className="text-muted-foreground line-clamp-2 mt-0.5">
                      {a.summary || a.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open tasks */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Open Tasks
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No open tasks</p>
          ) : (
            <div className="space-y-1">
              {tasks.slice(0, 3).map((t) => (
                <div key={t.id} className="border rounded-md p-1.5 text-xs">
                  <div className="font-medium line-clamp-1">{t.title}</div>
                  {t.dueAt && (
                    <div className="text-muted-foreground text-[10px]">
                      Due {formatDistanceToNow(new Date(t.dueAt), { addSuffix: true })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-1.5 pt-2 border-t">
          <Button onClick={onEditFull} variant="default" size="sm" className="w-full gap-1">
            <Edit2 className="h-3.5 w-3.5" /> Open Full Property Page
          </Button>
          <Button onClick={onEditBoundary} variant="outline" size="sm" className="w-full gap-1">
            <Pencil className="h-3.5 w-3.5" />
            {hasBoundary ? "Edit Boundary" : "Draw Boundary"}
          </Button>
          {hasBoundary && (
            <Button
              onClick={onRemoveBoundary}
              variant="outline"
              size="sm"
              className="w-full gap-1 text-muted-foreground"
            >
              Remove Boundary Only
            </Button>
          )}
          <Button
            onClick={onDelete}
            variant="outline"
            size="sm"
            className="w-full gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Property
          </Button>
        </div>
      </div>
    </div>
  );
}
