'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface MapStop {
  kind: string;
  label: string | null;
  lat: number | null;
  lng: number | null;
  arrivedAt: string | null;
}

const valid = (p: MapPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

export interface MapVehicle {
  lat: number;
  lng: number;
  label?: string;
}

export default function LoadMap({
  points,
  stops,
  route,
  vehicles,
  follow,
  height = 360,
}: {
  points: MapPoint[];
  stops: MapStop[];
  route?: [number, number][];
  vehicles?: MapVehicle[];
  follow?: { lat: number; lng: number } | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  // Serialised so the effect only re-runs when the geometry actually changes.
  const data = JSON.stringify({ points, stops, route, vehicles, follow });

  useEffect(() => {
    let disposed = false;

    const draw = async () => {
      const mod = await import('leaflet');
      const L = mod.default;
      if (disposed || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { scrollWheelZoom: true }).setView([39.5, -98.35], 4);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      const parsed = JSON.parse(data) as {
        points: MapPoint[];
        stops: MapStop[];
        route?: [number, number][];
        vehicles?: MapVehicle[];
        follow?: { lat: number; lng: number } | null;
      };
      const track = parsed.points.filter(valid);
      const stopPoints = parsed.stops
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
        .map((s) => ({ ...s, lat: s.lat as number, lng: s.lng as number }));

      const routeLine = (parsed.route ?? []).filter(
        (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])
      );
      if (routeLine.length > 1) {
        L.polyline(
          routeLine.map(([lng, lat]) => [lat, lng] as [number, number]),
          { color: '#0ea5e9', weight: 5, opacity: 0.75 }
        ).addTo(layer);
      }

      if (track.length > 1) {
        L.polyline(
          track.map((p) => [p.lat, p.lng] as [number, number]),
          { color: '#2563eb', weight: 3, opacity: 0.85 }
        ).addTo(layer);
      }

      (parsed.vehicles ?? []).forEach((v) => {
        if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return;
        L.circleMarker([v.lat, v.lng], {
          radius: 7,
          color: '#1d4ed8',
          weight: 2,
          fillColor: '#93c5fd',
          fillOpacity: 1,
        })
          .addTo(layer)
          .bindTooltip(v.label ?? 'Vehicle');
      });

      const last = track[track.length - 1];
      if (last) {
        L.circleMarker([last.lat, last.lng], {
          radius: 8,
          color: '#1d4ed8',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 1,
        })
          .addTo(layer)
          .bindTooltip('Current position');
      }

      stopPoints.forEach((s) => {
        L.circleMarker([s.lat, s.lng], {
          radius: 6,
          color: s.arrivedAt ? '#047857' : '#b45309',
          weight: 2,
          fillColor: s.arrivedAt ? '#10b981' : '#f59e0b',
          fillOpacity: 0.95,
        })
          .addTo(layer)
          .bindTooltip(`${s.kind === 'pickup' ? 'Pickup' : 'Drop-off'}: ${s.label ?? ''}`);
      });

      const all: [number, number][] = [
        ...track.map((p) => [p.lat, p.lng] as [number, number]),
        ...stopPoints.map((s) => [s.lat, s.lng] as [number, number]),
        ...routeLine.map(([lng, lat]) => [lat, lng] as [number, number]),
        ...(parsed.vehicles ?? [])
          .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
          .map((v) => [v.lat, v.lng] as [number, number]),
      ];

      if (parsed.follow && Number.isFinite(parsed.follow.lat) && Number.isFinite(parsed.follow.lng)) {
        map.setView([parsed.follow.lat, parsed.follow.lng], 15);
      } else if (all.length === 1) map.setView(all[0], 12);
      else if (all.length > 1) map.fitBounds(L.latLngBounds(all).pad(0.25));
      map.invalidateSize();
    };

    void draw();
    return () => {
      disposed = true;
    };
  }, [data]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    },
    []
  );

  return <div ref={containerRef} style={{ height }} className="z-0 w-full rounded-xl border border-slate-200 bg-slate-50" />;
}
