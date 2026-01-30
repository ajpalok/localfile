'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getDeviceName } from '@/lib/deviceName';
import { Device } from '@/types';
import DeviceList from '@/components/DeviceList';
import ChatInterface from '@/components/ChatInterface';
import { initFirebase } from '@/lib/firebaseInit';
import { WebRTCManager } from '@/lib/webrtc';

export default function Home() {
  const [webrtcManager, setWebrtcManager] = useState<WebRTCManager | null>(null);
  const [myDeviceName, setMyDeviceName] = useState<string>('Loading...');
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const [deviceId] = useState<string>(() => `device_${Math.random().toString(36).substr(2, 16)}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`);
  const [isMounted, setIsMounted] = useState(false);

  // Prevent browser tab suspension and keep connection alive
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const antiIdleInterval: NodeJS.Timeout = setInterval(() => {
      // Minimal DOM operation to keep page "active"
      const timestamp = Date.now();
      document.documentElement.setAttribute('data-last-activity', timestamp.toString());
    }, 30000);

    // Request wake lock to prevent tab suspension
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen');
          console.log('Wake lock acquired - tab will stay active');
        }
      } catch {
        console.log('Wake lock not supported or denied');
      }
    };

    // Request wake lock on mount
    requestWakeLock();

    // Re-acquire wake lock when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && wakeLock === null) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Error handling
    const handleError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error);
      event.preventDefault();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      event.preventDefault();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
      clearInterval(antiIdleInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    // Set mounted state and initialize device name
    setIsMounted(true);
    setMyDeviceName(getDeviceName());

    // Initialize Firebase and WebRTC
    try {
      const { database } = initFirebase();
      const manager = new WebRTCManager(database, deviceId, getDeviceName());

      // Set up callbacks
      manager.onDeviceList((deviceList) => {
        console.log('Device list updated:', deviceList);
        setDevices(deviceList);
        setIsConnected(true);
        setConnectionStatus('connected');
        
        // If selected device is no longer in the list, deselect it
        if (selectedDevice && !deviceList.find((d: Device) => d.id === selectedDevice.id)) {
          setSelectedDevice(null);
        }
      });

      setWebrtcManager(manager); // eslint-disable-line react-hooks/set-state-in-effect
      console.log('WebRTC Manager initialized');
    } catch (error) {
      console.error('Error initializing Firebase/WebRTC:', error);
      setConnectionStatus('disconnected');
    }

    return () => {
      if (webrtcManager) {
        webrtcManager.destroy();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeviceSelect = async (device: Device) => {
    setSelectedDevice(device);
    // Initiate WebRTC connection when device is selected
    if (webrtcManager) {
      // Add a small random delay to help prevent race conditions
      const delay = Math.random() * 200; // Random delay up to 200ms
      await new Promise(resolve => setTimeout(resolve, delay));
      await webrtcManager.connectToPeer(device.id);
    }
  };

  const handleBackToDevices = () => {
    setSelectedDevice(null);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-4 sm:px-4 sm:py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
                  <Image 
                    src="/icons/LocalFIle.png" 
                    alt="LocalFile Logo" 
                    className="w-8 h-8 sm:w-10 sm:h-10"
                    width={40}
                    height={40}
                  />
                  <span>
                    <span className="text-indigo-950">Local</span><span className='text-[#63CEA1]'>File</span>
                  </span>
                </h1>
                <p className="text-gray-600 text-sm sm:text-base">
                  P2P file sharing and messaging on your local network
                </p>
              </div>
              <div className="text-center sm:text-right">
                <div className="flex items-center justify-center sm:justify-end gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-green-500' :
                    connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
                    connectionStatus === 'disconnected' ? 'bg-red-500' :
                    'bg-gray-500'
                  }`}></div>
                  <span className="text-sm text-gray-600">
                    {connectionStatus === 'connected' ? 'Connected' :
                     connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                     connectionStatus === 'disconnected' ? 'Disconnected' :
                     'Connecting...'}
                  </span>
                </div>
                <div className="bg-indigo-100 px-3 sm:px-4 py-2 rounded-lg">
                  <p className="text-sm text-gray-600">Your device name</p>
                  <p className="text-base sm:text-lg font-bold text-indigo-600 truncate">
                    {isMounted ? myDeviceName : 'Loading...'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {!selectedDevice ? (
              <DeviceList
                devices={devices}
                onDeviceSelect={handleDeviceSelect}
                isConnected={isConnected}
              />
            ) : (
              <ChatInterface
                webrtcManager={webrtcManager}
                selectedDevice={selectedDevice}
                myDeviceName={myDeviceName}
                onBack={handleBackToDevices}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
