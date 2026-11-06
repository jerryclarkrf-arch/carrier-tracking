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

export default function LoadMap({
  points,
  stops,
  height = 360,
}: {
  points: MapPoint[];
  stops: MapStop[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  // Serialised so the effect only re-runs when the geometry actually changes.
  const data = JSON.stringify({ points, stops });

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

      const parsed = JSON.parse(data) as { points: MapPoint[]; stops: MapStop[] };
      const track = parsed.points.filter(valid);
      const stopPoints = parsed.stops
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
        .map((s) => ({ ...s, lat: s.lat as number, lng: s.lng as number }));

      if (track.length > 1) {
        L.polyline(
          track.map((p) => [p.lat, p.lng] as [number, number]),
          { color: '#2563eb', weight: 3, opacity: 0.85 }
        ).addTo(layer);
      }

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

      const all = [...track.map((p) => [p.lat, p.lng] as [number, number]), ...stopPoints.map((s) => [s.lat, s.lng] as [number, number])];
      if (all.length === 1) map.setView(all[0], 12);
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
