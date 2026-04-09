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
  latitude: number | null;
  longitude: number | null;
  boundary: string | null;
  unitCount: number | null;
  askingPrice: number | null;
  capRate: number | null;
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

  // After-draw "Name this property" modal state
  const [pendingPolygon, setPendingPolygon] = useState<google.maps.Polygon | null>(null);
  const [pendingCenter, setPendingCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [newPropertyForm, setNewPropertyForm] = useState({
    name: "",
    propertyType: "apartment",
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  // Edit-boundary mode for an existing property
  const [editingPropertyId, setEditingPropertyId] = useState<number | null>(null);

  // ─── Data ─────────────────────────────────────────────────────────────────
  const configQuery = trpc.properties.mapsConfig.useQuery();
  const profileQuery = trpc.users.getMyProfile.useQuery();
  const prefs: UserPreferences = parsePreferences(profileQuery.data?.preferences ?? "");
  const enabledTypes = getEnabledTypes(prefs);
  const enabledPropertyTypeOptions = ALL_PROPERTY_TYPES.filter((t) =>
    enabledTypes.includes(t.value),
  );
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

  // ─── Map initialization (runs once when API key + container ready) ─────────
  useEffect(() => {
    if (!configQuery.data?.apiKey) return;
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialized

    let cancelled = false;
    loadGoogleMaps(configQuery.data.apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;

        // Default center: Boise (will be replaced by geolocation if available)
        const defaultCenter = { lat: 43.615, lng: -116.2023 };
        const map = new maps.Map(containerRef.current, {
          center: defaultCenter,
          zoom: 11,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy", // single-finger pan on mobile
          mapTypeId: maps.MapTypeId.HYBRID,
        });
        mapRef.current = map;

        // Center on user's location if they grant permission
        if (navigator.geolocation) {
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

            setPendingPolygon(polygon);
            setPendingCenter(centroid);
            setShowNameModal(true);
            // Stop drawing mode after each polygon
            drawingManager.setDrawingMode(null);

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
    if (!drawingManagerRef.current || !window.google?.maps) return;
    drawingManagerRef.current.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON);
    toast.info("Tap points around the property. Tap the first point again to close.");
  };

  const cancelDrawing = () => {
    if (drawingManagerRef.current) drawingManagerRef.current.setDrawingMode(null);
    if (pendingPolygon) {
      pendingPolygon.setMap(null);
      setPendingPolygon(null);
    }
    setPendingCenter(null);
    setShowNameModal(false);
    setNewPropertyForm({ name: "", propertyType: "apartment", address: "", city: "", state: "", zip: "" });
  };

  const recenterOnMe = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(15);
      },
      () => toast.error("Couldn't get your location"),
      { timeout: 5000 },
    );
  };

  // ─── Save a newly-drawn property ─────────────────────────────────────────
  const handleSaveNewProperty = async () => {
    if (!pendingPolygon || !pendingCenter) return;
    if (!newPropertyForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    // Convert the polygon to GeoJSON
    const path = pendingPolygon.getPath();
    const ring: number[][] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const pt = path.getAt(i);
      ring.push([pt.lng(), pt.lat()]);
    }
    // Close the ring (GeoJSON requires first === last)
    if (ring.length > 0) ring.push(ring[0]);
    const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });

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

      // Clean up the temporary polygon — refetch will draw the saved one
      pendingPolygon.setMap(null);
      setPendingPolygon(null);
      setPendingCenter(null);
      setShowNameModal(false);
      setNewPropertyForm({ name: "", propertyType: "apartment", address: "", city: "", state: "", zip: "" });
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
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        {!editingPropertyId && (
          <Button
            onClick={startDrawing}
            disabled={!mapsReady}
            className="gap-2 shadow-lg"
            size="sm"
          >
            <Plus className="h-4 w-4" /> Draw New Property
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
          onClose={() => setSelectedProperty(null)}
          onEditFull={() => setLocation(`/properties/${selectedProperty.id}`)}
          onEditBoundary={() => {
            startEditBoundary(selectedProperty.id);
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
                  placeholder="Boise"
                />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input
                  value={newPropertyForm.state}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, state: e.target.value })}
                  placeholder="ID"
                />
              </div>
              <div>
                <Label className="text-xs">Zip</Label>
                <Input
                  value={newPropertyForm.zip}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, zip: e.target.value })}
                  placeholder="83702"
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
  onClose: () => void;
  onEditFull: () => void;
  onEditBoundary: () => void;
  onRemoveBoundary: () => void;
  onDelete: () => void;
  hasBoundary: boolean;
  prefs: UserPreferences;
}) {
  const fullAddress = [property.address, property.city, property.state].filter(Boolean).join(", ");
  const typeColor = getTypeColor(prefs, property.propertyType);

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

        {/* Property details */}
        {(property.unitCount || property.askingPrice || property.capRate) && (
          <div className="grid grid-cols-2 gap-2 text-xs border-y py-2">
            {property.unitCount && (
              <div>
                <div className="text-muted-foreground">Units</div>
                <div className="font-medium">{property.unitCount}</div>
              </div>
            )}
            {property.askingPrice && (
              <div>
                <div className="text-muted-foreground">Asking</div>
                <div className="font-medium">
                  ${(property.askingPrice / 1000000).toFixed(2)}M
                </div>
              </div>
            )}
            {property.capRate && (
              <div>
                <div className="text-muted-foreground">Cap</div>
                <div className="font-medium">{property.capRate}%</div>
              </div>
            )}
          </div>
        )}

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
