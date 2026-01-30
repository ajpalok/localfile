'use client';

import { Device } from '@/types';

interface DeviceListProps {
  devices: Device[];
  onDeviceSelect: (device: Device) => void;
  isConnected: boolean;
}

export default function DeviceList({ devices, onDeviceSelect, isConnected }: DeviceListProps) {
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Available Devices</h2>
        <p className="text-gray-600 text-sm sm:text-base">
          {devices.length === 0
            ? 'No devices found on the network. Make sure other devices are connected.'
            : `${devices.length} device${devices.length > 1 ? 's' : ''} available`
          }
        </p>
      </div>

      {!isConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-yellow-800 font-medium text-sm sm:text-base">Not connected to server</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {devices.length === 0 && isConnected ? (
          <div className="col-span-full text-center py-8 sm:py-12">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 text-base sm:text-lg">Waiting for devices...</p>
            <p className="text-gray-400 text-sm mt-2">Open this app on other devices in your network</p>
          </div>
        ) : (
          devices.map((device) => (
            <button
              key={device.id}
              onClick={() => onDeviceSelect(device)}
              className="bg-linear-to-br from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 border-2 border-indigo-200 hover:border-indigo-300 rounded-lg p-4 sm:p-6 transition-all duration-200 transform hover:scale-105 hover:shadow-lg touch-manipulation"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-indigo-500 rounded-full p-2 sm:p-3 flex-shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <h3 className="font-bold text-base sm:text-lg text-gray-800 truncate">{device.name}</h3>
                  <p className="text-sm text-gray-500">Tap to connect</p>
                </div>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2 text-sm sm:text-base">How to use:</h3>
        <ul className="list-disc list-inside text-blue-800 space-y-1 text-xs sm:text-sm">
          <li>Make sure all devices are on the same local network</li>
          <li>Share your device name displayed above with others so they can identify you</li>
          <li>Select the device to start chatting and sharing files</li>
          <li>Messages are not stored - they will disappear on page reload</li>
        </ul>
      </div>
    </div>
  );
}
