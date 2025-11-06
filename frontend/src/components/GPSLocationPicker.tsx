import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface GPSLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (lat: number, lng: number, address?: string) => void;
  initialLat?: number;
  initialLng?: number;
}

function LocationMarker({ position, setPosition }: any) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : <Marker position={position} />;
}

const GPSLocationPicker: React.FC<GPSLocationPickerProps> = ({
  isOpen,
  onClose,
  onLocationSelect,
  initialLat = 0,
  initialLng = 0,
}) => {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [mapCenter, setMapCenter] = useState<[number, number]>([initialLat || 0, initialLng || 0]);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState<string>('');

  // Get user's current location
  const getCurrentLocation = () => {
    setLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (location) => {
          const lat = location.coords.latitude;
          const lng = location.coords.longitude;
          setPosition({ lat, lng });
          setMapCenter([lat, lng]);
          setLoading(false);
          // Reverse geocode to get address
          reverseGeocode(lat, lng);
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('Unable to get your location. Please click on the map to select a location.');
          setLoading(false);
        }
      );
    } else {
      alert('Geolocation is not supported by your browser');
      setLoading(false);
    }
  };

  // Reverse geocoding using Nominatim (OpenStreetMap)
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      if (data.display_name) {
        setAddress(data.display_name);
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    }
  };

  // Update address when position changes
  useEffect(() => {
    if (position) {
      reverseGeocode(position.lat, position.lng);
    }
  }, [position]);

  const handleConfirm = () => {
    if (position) {
      onLocationSelect(position.lat, position.lng, address);
      onClose();
    } else {
      alert('Please select a location on the map or use current location');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(5px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e0e0e0',
            background: 'linear-gradient(135deg, #1E3A5F 0%, #2C5282 100%)',
            borderRadius: '12px 12px 0 0',
          }}
        >
          <h2
            style={{
              margin: 0,
              color: '#FFD700',
              fontSize: '1.5rem',
              fontWeight: '600',
            }}
          >
            📍 Select GPS Location
          </h2>
          <p
            style={{
              margin: '0.5rem 0 0 0',
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '0.9rem',
            }}
          >
            Click on the map to select a location or use your current location
          </p>
        </div>

        {/* Map Container */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            minHeight: '400px',
            overflow: 'hidden',
          }}
        >
          <MapContainer
            center={mapCenter}
            zoom={position ? 15 : 2}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker position={position} setPosition={setPosition} />
          </MapContainer>

          {/* Get Current Location Button - Floating on map */}
          <button
            onClick={getCurrentLocation}
            disabled={loading}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              zIndex: 1000,
              padding: '0.75rem 1rem',
              background: 'white',
              border: '2px solid #1E3A5F',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              color: '#1E3A5F',
            }}
          >
            {loading ? '📍 Getting location...' : '📍 Use My Location'}
          </button>
        </div>

        {/* Location Info */}
        {position && (
          <div
            style={{
              padding: '1rem 1.5rem',
              background: '#f8f9fa',
              borderTop: '1px solid #e0e0e0',
            }}
          >
            <p
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.9rem',
                color: '#666',
                fontWeight: '600',
              }}
            >
              Selected Location:
            </p>
            <p
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.85rem',
                color: '#333',
              }}
            >
              <strong>Coordinates:</strong> {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
            </p>
            {address && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  color: '#333',
                }}
              >
                <strong>Address:</strong> {address}
              </p>
            )}
          </div>
        )}

        {/* Footer Buttons */}
        <div
          style={{
            padding: '1.5rem',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            gap: '1rem',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#e0e0e0',
              color: '#333',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!position}
            style={{
              padding: '0.75rem 1.5rem',
              background: position ? '#1E3A5F' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: position ? 'pointer' : 'not-allowed',
            }}
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
};

export default GPSLocationPicker;