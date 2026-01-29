'use client';

import { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Device, Message, FileTransfer } from '@/types';

interface ChatInterfaceProps {
  socket: Socket | null;
  selectedDevice: Device;
  myDeviceName: string;
  onBack: () => void;
}

export default function ChatInterface({ socket, selectedDevice, myDeviceName, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [fileTransfers, setFileTransfers] = useState<FileTransfer[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, fileTransfers]);

  useEffect(() => {
    if (!socket) return;

    // Listen for incoming messages
    socket.on('receive-message', (data) => {
      setMessages((prev) => [...prev, { ...data, isSent: false }]);
    });

    // Listen for file metadata
    socket.on('receive-file-metadata', (data) => {
      const transfer: FileTransfer = {
        transferId: data.fileData.transferId,
        fileData: data.fileData,
        senderId: data.senderId,
        senderName: data.senderName,
        status: 'pending',
        chunks: []
      };
      setFileTransfers((prev) => [...prev, transfer]);
    });

    // Listen for file chunks
    socket.on('receive-file-chunk', (data) => {
      setFileTransfers((prev) =>
        prev.map((transfer) => {
          if (transfer.transferId === data.transferId) {
            const newChunks = [...(transfer.chunks || []), data.chunk];
            return {
              ...transfer,
              chunks: newChunks,
              status: 'downloading' as const
            };
          }
          return transfer;
        })
      );
    });

    // Listen for file transfer complete
    socket.on('file-transfer-completed', (data) => {
      setFileTransfers((prev) =>
        prev.map((transfer) => {
          if (transfer.transferId === data.transferId) {
            return { ...transfer, status: 'completed' as const };
          }
          return transfer;
        })
      );
    });

    // Listen for file transfer cancelled
    socket.on('file-transfer-cancelled', (data) => {
      setFileTransfers((prev) =>
        prev.filter((transfer) => transfer.transferId !== data.transferId)
      );
    });

    return () => {
      socket.off('receive-message');
      socket.off('receive-file-metadata');
      socket.off('receive-file-chunk');
      socket.off('file-transfer-completed');
      socket.off('file-transfer-cancelled');
    };
  }, [socket]);

  const sendMessage = () => {
    if (!socket || !inputMessage.trim()) return;

    const message: Message = {
      message: inputMessage,
      senderId: socket.id || '',
      senderName: myDeviceName,
      timestamp: Date.now(),
      isSent: true
    };

    setMessages((prev) => [...prev, message]);

    socket.emit('send-message', {
      targetId: selectedDevice.id,
      message: inputMessage,
      senderId: socket.id,
      senderName: myDeviceName
    });

    setInputMessage('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    const transferId = `${Date.now()}-${Math.random()}`;
    const reader = new FileReader();

    reader.onload = async (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      
      // Send file metadata first
      socket.emit('send-file-metadata', {
        targetId: selectedDevice.id,
        fileData: {
          name: file.name,
          size: file.size,
          type: file.type,
          transferId
        }
      });

      // Split file into chunks (1MB each)
      const chunkSize = 1024 * 1024;
      const chunks = Math.ceil(arrayBuffer.byteLength / chunkSize);

      for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, arrayBuffer.byteLength);
        const chunk = arrayBuffer.slice(start, end);

        socket.emit('send-file-chunk', {
          targetId: selectedDevice.id,
          chunk: Array.from(new Uint8Array(chunk)),
          transferId
        });
      }

      // Notify transfer complete
      socket.emit('file-transfer-complete', {
        targetId: selectedDevice.id,
        transferId
      });

      // Add to local transfers as sent
      const transfer: FileTransfer = {
        transferId,
        fileData: {
          name: file.name,
          size: file.size,
          type: file.type,
          transferId
        },
        senderId: socket.id || '',
        senderName: myDeviceName,
        status: 'completed'
      };
      setFileTransfers((prev) => [...prev, transfer]);
    };

    reader.readAsArrayBuffer(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadFile = (transfer: FileTransfer) => {
    if (!transfer.chunks || transfer.chunks.length === 0) return;

    // Combine all chunks
    const totalSize = transfer.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combinedArray = new Uint8Array(totalSize);
    let offset = 0;

    transfer.chunks.forEach((chunk) => {
      const uint8Array = new Uint8Array(chunk);
      combinedArray.set(uint8Array, offset);
      offset += uint8Array.length;
    });

    // Create blob and download
    const blob = new Blob([combinedArray], { type: transfer.fileData.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = transfer.fileData.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Remove transfer from list
    setFileTransfers((prev) => prev.filter((t) => t.transferId !== transfer.transferId));
  };

  const cancelTransfer = (transferId: string) => {
    if (socket) {
      socket.emit('cancel-file-transfer', {
        targetId: selectedDevice.id,
        transferId
      });
    }
    setFileTransfers((prev) => prev.filter((t) => t.transferId !== transferId));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-280px)] max-h-[calc(100dvh-280px)]">
      {/* Header */}
      <div className="bg-linear-to-r from-indigo-500 to-blue-500 text-white p-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="hover:bg-white/20 rounded-lg p-2 transition-colors flex-shrink-0"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold truncate">{selectedDevice.name}</h2>
            <p className="text-sm opacity-90">Connected</p>
          </div>
        </div>
        <div className="bg-white/20 px-3 py-1 rounded-lg flex-shrink-0 ml-2">
          <p className="text-sm truncate max-w-32">You: {myDeviceName}</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 min-h-0">
        {messages.length === 0 && fileTransfers.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-500">No messages yet</p>
            <p className="text-gray-400 text-sm mt-1">Start a conversation or share a file</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.isSent ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[70%] rounded-lg p-3 ${
                msg.isSent
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white text-gray-800 border border-gray-200'
              }`}
            >
              {!msg.isSent && (
                <p className="text-xs font-semibold mb-1 opacity-70 truncate">{msg.senderName}</p>
              )}
              <p className="wrap-break-word">{msg.message}</p>
              <p className={`text-xs mt-1 ${msg.isSent ? 'text-indigo-200' : 'text-gray-500'}`}>
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}

        {fileTransfers.map((transfer) => (
          <div
            key={transfer.transferId}
            className={`flex ${transfer.senderId === socket?.id ? 'justify-end' : 'justify-start'}`}
          >
            <div className="max-w-[85%] sm:max-w-[70%] bg-white border-2 border-indigo-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 rounded-lg p-3 flex-shrink-0">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{transfer.fileData.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(transfer.fileData.size)}</p>
                  {transfer.senderId !== socket?.id && (
                    <p className="text-xs text-gray-400 mt-1 truncate">From: {transfer.senderName}</p>
                  )}
                  {transfer.senderId === socket?.id && (
                    <p className="text-xs text-indigo-600 mt-1">✓ Sent</p>
                  )}
                </div>
              </div>

              {transfer.senderId !== socket?.id && transfer.status !== 'completed' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => downloadFile(transfer)}
                    disabled={transfer.status === 'pending' || (transfer.chunks?.length === 0)}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                  >
                    {transfer.status === 'downloading' ? 'Receiving...' : 'Download'}
                  </button>
                  <button
                    onClick={() => cancelTransfer(transfer.transferId)}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {transfer.senderId !== socket?.id && transfer.status === 'completed' && (
                <button
                  onClick={() => downloadFile(transfer)}
                  className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors mt-3 text-sm"
                >
                  Download Now
                </button>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t bg-white p-4 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
            title="Attach file"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type a message..."
              className="w-full border text-black border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              style={{ minHeight: '48px' }}
              autoFocus={true}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim()}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-medium transition-colors flex-shrink-0 touch-manipulation disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
