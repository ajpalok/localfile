import { Database, ref, set, onValue, onDisconnect, remove, push, get } from 'firebase/database';
import { rtcConfig } from './firebase';
import { Device } from '@/types';

// Define callback data types
interface MessageData {
  message: string;
  senderName: string;
  timestamp: number;
  type: 'message';
}

interface FileTransferData {
  type: 'file-metadata' | 'file-chunk' | 'file-complete' | 'file-accepted' | 'file-declined' | 'file-data';
  name?: string;
  size?: number;
  fileType?: string;
  index?: number;
  chunk?: string;
  total?: number;
  totalChunks?: number;
  senderName?: string;
  timestamp?: number;
  transferId?: string;
  data?: ArrayBuffer;
}

interface SignalData {
  from: string;
  type: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

interface DeviceData {
  name: string;
  timestamp: number;
}

// WebRTC Peer Connection Manager
export class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private connectionStates: Map<string, string> = new Map();
  private iceCandidatesBuffer: Map<string, RTCIceCandidateInit[]> = new Map(); // Buffer for ICE candidates
  private database: Database;
  private myDeviceId: string;
  private myDeviceName: string;
  private onMessageCallback?: (peerId: string, message: MessageData) => void;
  private onDeviceListCallback?: (devices: Device[]) => void;
  private onFileTransferCallback?: (peerId: string, data: FileTransferData) => void;
  private onConnectionStateCallback?: (peerId: string, state: string) => void;

  constructor(database: Database, deviceId: string, deviceName: string) {
    this.database = database;
    this.myDeviceId = deviceId;
    this.myDeviceName = deviceName;
    this.registerDevice().then(() => {
      this.listenForDevices();
      this.listenForSignals();
    });
    // Clean up old connections every 30 seconds
    setInterval(() => this.cleanupConnections(), 30000);
    // Clean up old database data every 5 minutes
    setInterval(() => this.cleanupDatabase(), 300000);
  }

  // Register this device in Firebase
  private async registerDevice() {
    const deviceRef = ref(this.database, `localfile/app/devices/${this.myDeviceId}`);
    await set(deviceRef, {
      name: this.myDeviceName,
      timestamp: Date.now()
    });

    // Remove device on disconnect
    onDisconnect(deviceRef).remove();
  }

  // Listen for other devices
  private listenForDevices() {
    const devicesRef = ref(this.database, 'localfile/app/devices');
    onValue(devicesRef, (snapshot) => {
      const devices: Device[] = [];
      snapshot.forEach((childSnapshot) => {
        const deviceId = childSnapshot.key;
        const deviceData = childSnapshot.val();
        if (deviceId && deviceId !== this.myDeviceId) {
          devices.push({
            id: deviceId,
            name: deviceData?.name || 'Unknown'
          });
        }
      });
      if (this.onDeviceListCallback) {
        this.onDeviceListCallback(devices);
      }
    });
  }

  // Listen for WebRTC signaling messages
  private listenForSignals() {
    const signalRef = ref(this.database, `localfile/app/signals/${this.myDeviceId}`);
    onValue(signalRef, async (snapshot) => {
      const signals: Array<{ key: string; value: SignalData }> = [];
      snapshot.forEach((childSnapshot) => {
        signals.push({
          key: childSnapshot.key!,
          value: childSnapshot.val()
        });
      });

      // Process all signals sequentially to avoid race conditions
      for (const { key, value } of signals) {
        if (value && value.from && value.type) {
          await this.handleSignal(value);
          // Remove processed signal
          remove(ref(this.database, `localfile/app/signals/${this.myDeviceId}/${key}`));
        }
      }
    });
  }

  // Handle incoming WebRTC signals
  private async handleSignal(signal: SignalData) {
    const { from, type, data } = signal;

    // Check if we already have an active connection with this peer
    const existingPc = this.peerConnections.get(from);

    if (type === 'offer') {
      // Always handle offers - they create new connections
      // But skip if we already have a stable/connected connection
      if (existingPc && (existingPc.connectionState === 'connected' || existingPc.signalingState === 'stable')) {
        return;
      }
      await this.handleOffer(from, data as RTCSessionDescriptionInit);
    } else if (type === 'answer') {
      // Only handle answer if we have a pending connection waiting for answer
      if (existingPc && existingPc.signalingState === 'have-local-offer') {
        await this.handleAnswer(from, data as RTCSessionDescriptionInit);
      }
    } else if (type === 'ice-candidate') {
      // Handle ICE candidates for any existing connection
      if (existingPc) {
        await this.handleIceCandidate(from, data as RTCIceCandidateInit);
      }
    }
  }

  // Clean up failed/disconnected connections
  private cleanupConnections() {
    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'closed') {
        console.log(`Cleaning up connection for ${peerId} in state ${pc.connectionState}`);
        pc.close();
        this.peerConnections.delete(peerId);
        this.dataChannels.delete(peerId);
      }
    }
  }

  // Clean up old database data
  private async cleanupDatabase() {
    try {
      const now = Date.now();
      const maxAge = 10 * 60 * 1000; // 10 minutes

      // Clean up old device records
      const devicesRef = ref(this.database, 'localfile/app/devices');
      const devicesSnapshot = await get(devicesRef);
      if (devicesSnapshot.exists()) {
        const devices = devicesSnapshot.val();
        for (const [deviceId, deviceData] of Object.entries(devices)) {
          if (deviceData && typeof deviceData === 'object' && 'timestamp' in deviceData) {
            const deviceTimestamp = (deviceData as DeviceData).timestamp;
            if (now - deviceTimestamp > maxAge) {
              console.log(`Removing old device: ${deviceId}`);
              await remove(ref(this.database, `localfile/app/devices/${deviceId}`));
            }
          }
        }
      }

      // Clean up old signaling messages
      const signalsRef = ref(this.database, `localfile/app/signals/${this.myDeviceId}`);
      const signalsSnapshot = await get(signalsRef);
      if (signalsSnapshot.exists()) {
        const signals = signalsSnapshot.val();
        for (const [signalId, signalData] of Object.entries(signals)) {
          if (signalData && typeof signalData === 'object' && 'timestamp' in signalData) {
            const signalTimestamp = (signalData as SignalData).timestamp;
            if (now - signalTimestamp > maxAge) {
              console.log(`Removing old signal: ${signalId}`);
              await remove(ref(this.database, `localfile/app/signals/${this.myDeviceId}/${signalId}`));
            }
          }
        }
      }

      console.log('Database cleanup completed');
    } catch (error) {
      console.error('Error during database cleanup:', error);
    }
  }

  // Create peer connection
  private createPeerConnection(peerId: string, initiator: boolean): RTCPeerConnection {
    // Check if we already have a connection for this peer
    let pc = this.peerConnections.get(peerId);

    if (pc) {
      // If connection exists and is actually connected/connecting, reuse it
      if (pc.connectionState === 'connected' || pc.connectionState === 'connecting') {
        console.log(`Reusing existing connection for ${peerId}`);
        return pc;
      }
      // If connection is in a bad state, close it and create new one
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        console.log(`Closing bad connection for ${peerId} and creating new one`);
        pc.close();
        this.peerConnections.delete(peerId);
      } else if (pc.connectionState === 'new' && pc.signalingState === 'stable') {
        // Connection exists but hasn't been used yet, we can reuse it
        console.log(`Reusing unused connection for ${peerId}`);
        return pc;
      } else {
        // Connection is in some other state (like have-local-offer), close it
        console.log(`Connection for ${peerId} in state ${pc.connectionState}/${pc.signalingState}, creating new one`);
        pc.close();
        this.peerConnections.delete(peerId);
      }
    }

    console.log(`Creating new peer connection for ${peerId}`);
    pc = new RTCPeerConnection(rtcConfig);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Convert RTCIceCandidate to plain object for Firebase serialization
        const candidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment
        };
        this.sendSignal(peerId, 'ice-candidate', candidateData);
      }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState);
    };

    // If initiator, create data channel
    if (initiator) {
      const dataChannel = pc.createDataChannel('data');
      this.setupDataChannel(peerId, dataChannel);
    } else {
      // If receiver, wait for data channel
      pc.ondatachannel = (event) => {
        this.setupDataChannel(peerId, event.channel);
      };
    }

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  // Setup data channel
  private setupDataChannel(peerId: string, dataChannel: RTCDataChannel) {
    this.dataChannels.set(peerId, dataChannel);
    this.connectionStates.set(peerId, 'connecting');

    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
      this.connectionStates.set(peerId, 'connected');
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(peerId, 'connected');
      }
    };

    dataChannel.onmessage = (event) => {
      // Handle binary data (file chunks)
      if (event.data instanceof ArrayBuffer) {
        if (this.onFileTransferCallback) {
          this.onFileTransferCallback(peerId, {
            type: 'file-data',
            data: event.data
          } as any);
        }
        return;
      }

      // Handle JSON messages
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'message') {
          if (this.onMessageCallback) {
            this.onMessageCallback(peerId, data);
          }

          // Check if the message content is a file transfer command
          try {
            const messageData = JSON.parse(data.message);
            if (messageData.type === 'file-accepted' || messageData.type === 'file-declined') {
              if (this.onFileTransferCallback) {
                this.onFileTransferCallback(peerId, messageData);
              }
            }
          } catch (e) {
            // Not a JSON message, ignore
          }
        } else if (data.type === 'file-metadata' || data.type === 'file-chunk' || data.type === 'file-complete' ||
                   data.type === 'file-accepted' || data.type === 'file-declined') {
          if (this.onFileTransferCallback) {
            this.onFileTransferCallback(peerId, data);
          }
        }
      } catch (error) {
        console.error('Error parsing data channel message:', error, 'Raw data:', event.data);
      }
    };

    dataChannel.onerror = (event) => {
      const error = event as RTCErrorEvent;
      console.error(`Data channel error with ${peerId}:`, {
        error: error.error,
        type: error.type,
        target: error.target
      });
      this.connectionStates.set(peerId, 'error');
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(peerId, 'error');
      }
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
      this.connectionStates.set(peerId, 'disconnected');
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(peerId, 'disconnected');
      }
    };
  }

  // Connect to a peer
  async connectToPeer(peerId: string) {
    try {
      // Prevent race conditions by only allowing the device with smaller ID to initiate
      if (this.myDeviceId >= peerId) {
        console.log(`Not initiating connection to ${peerId} (our ID ${this.myDeviceId} >= peer ID ${peerId}) - peer should initiate`);
        return;
      }

      console.log(`Initiating connection to ${peerId} (our ID ${this.myDeviceId} < peer ID ${peerId})`);

      // Check if we already have an active connection
      const existingPc = this.peerConnections.get(peerId);
      if (existingPc) {
        if (existingPc.connectionState === 'connected' || existingPc.connectionState === 'connecting') {
          console.log(`Already connected/connecting to ${peerId}`);
          return;
        }
        // If we have a remote offer, don't create a new local offer
        if (existingPc.signalingState === 'have-remote-offer') {
          console.log(`Already have remote offer from ${peerId}, waiting for answer`);
          return;
        }
        // If we're waiting for an answer, don't create another offer
        if (existingPc.signalingState === 'have-local-offer') {
          console.log(`Already waiting for answer from ${peerId}`);
          return;
        }
      }

      const pc = this.createPeerConnection(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Convert RTCSessionDescription to plain object for Firebase serialization
      const offerData = {
        type: offer.type,
        sdp: offer.sdp
      };
      await this.sendSignal(peerId, 'offer', offerData);
    } catch (error) {
      console.error(`Failed to connect to peer ${peerId}:`, error);
    }
  }

  // Handle incoming offer
  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    try {
      console.log(`Received offer from ${peerId} (our ID: ${this.myDeviceId}, peer ID: ${peerId})`);

      let pc = this.peerConnections.get(peerId);

      // If we don't have a connection or it's in a stable state, create one
      if (!pc || pc.signalingState === 'stable') {
        console.log(`Accepting offer from ${peerId} - creating new connection`);
        pc = this.createPeerConnection(peerId, false);
      } else if (pc.signalingState === 'have-remote-offer') {
        // Already have a remote offer, ignore this one
        console.log(`Ignoring duplicate offer from ${peerId}`);
        return;
      } else if (pc.signalingState === 'have-local-offer') {
        // We have a local offer, but if peer has higher ID, they shouldn't have sent offer
        // This indicates a race condition - let the higher ID device win
        if (this.myDeviceId < peerId) {
          console.log(`Race condition resolved: accepting offer from higher-ID peer ${peerId}`);
          // Reset our local offer and accept theirs
          pc = this.createPeerConnection(peerId, false);
        } else {
          console.log(`Ignoring offer from ${peerId} while having local offer (we have higher priority)`);
          return;
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush any buffered ICE candidates now that remote description is set
      await this.flushIceCandidates(peerId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      // Convert RTCSessionDescription to plain object for Firebase serialization
      const answerData = {
        type: answer.type,
        sdp: answer.sdp
      };
      await this.sendSignal(peerId, 'answer', answerData);
    } catch (error) {
      console.error(`Failed to handle offer from ${peerId}:`, error);
    }
  }

  // Handle incoming answer
  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    try {
      const pc = this.peerConnections.get(peerId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        // Flush any buffered ICE candidates now that remote description is set
        await this.flushIceCandidates(peerId);
      }
    } catch (error) {
      console.error(`Failed to handle answer from ${peerId}:`, error);
    }
  }

  // Flush buffered ICE candidates for a peer
  private async flushIceCandidates(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    const bufferedCandidates = this.iceCandidatesBuffer.get(peerId);
    if (!bufferedCandidates || bufferedCandidates.length === 0) return;

    console.log(`Flushing ${bufferedCandidates.length} buffered ICE candidates for ${peerId}`);

    for (const candidate of bufferedCandidates) {
      try {
        const iceCandidate = new RTCIceCandidate(candidate);
        await pc.addIceCandidate(iceCandidate);
      } catch (error) {
        console.error(`Failed to add buffered ICE candidate for ${peerId}:`, error);
      }
    }

    // Clear the buffer
    this.iceCandidatesBuffer.delete(peerId);
  }

  // Handle ICE candidate
  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(peerId);
    if (!pc || !candidate || !candidate.candidate) {
      return;
    }

    // If remote description is not set yet, buffer the candidate
    if (!pc.remoteDescription) {
      console.log(`Buffering ICE candidate for ${peerId} (remote description not set yet)`);
      if (!this.iceCandidatesBuffer.has(peerId)) {
        this.iceCandidatesBuffer.set(peerId, []);
      }
      this.iceCandidatesBuffer.get(peerId)!.push(candidate);
      return;
    }

    // Remote description is set, add the candidate immediately
    try {
      const iceCandidate = new RTCIceCandidate(candidate);
      await pc.addIceCandidate(iceCandidate);
    } catch (error) {
      console.error(`Failed to add ICE candidate for ${peerId}:`, error);
    }
  }

  // Send signaling message via Firebase
  private async sendSignal(to: string, type: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) {
    const signalRef = ref(this.database, `localfile/app/signals/${to}`);
    await push(signalRef, {
      from: this.myDeviceId,
      type,
      data,
      timestamp: Date.now()
    });
  }

  // Send message to peer
  sendMessage(peerId: string, message: string): boolean {
    const dataChannel = this.dataChannels.get(peerId);
    const connectionState = this.connectionStates.get(peerId);

    if (!dataChannel) {
      console.log(`No data channel for ${peerId}`);
      return false;
    }

    if (dataChannel.readyState !== 'open') {
      console.log(`Data channel for ${peerId} is ${dataChannel.readyState}, connection state: ${connectionState}`);
      return false;
    }

    try {
      dataChannel.send(JSON.stringify({
        type: 'message',
        message,
        senderName: this.myDeviceName,
        timestamp: Date.now()
      }));
      return true;
    } catch (error) {
      console.error(`Failed to send message to ${peerId}:`, error);
      return false;
    }
  }

  // Send file to peer
  async sendFile(peerId: string, file: File) {
    const dataChannel = this.dataChannels.get(peerId);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error(`Cannot send file: data channel not ready for ${peerId}`);
      return false;
    }

    const transferId = `${this.myDeviceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise<boolean>((resolve, reject) => {
      try {
        // Send file metadata
        const metadataMessage = JSON.stringify({
          type: 'file-metadata',
          name: file.name,
          size: file.size,
          fileType: file.type,
          transferId: transferId,
          timestamp: Date.now()
        });
        console.log(`Sending file metadata for ${file.name} with transferId ${transferId}`);
        dataChannel.send(metadataMessage);

        // Set up temporary file transfer callback for acceptance/decline
        const originalCallback = this.onFileTransferCallback;
        this.onFileTransferCallback = (callbackPeerId, data) => {
          // Call original callback first
          if (originalCallback) {
            originalCallback(callbackPeerId, data);
          }

          // Handle our file transfer responses
          if (callbackPeerId === peerId) {
            if (data.type === 'file-accepted' && data.transferId === transferId) {
              console.log(`File transfer accepted for ${transferId}, starting to send chunks`);
              // Restore original callback
              this.onFileTransferCallback = originalCallback;
              // Start sending the file
              this.sendFileChunks(dataChannel, file, transferId).then(resolve).catch(reject);
            } else if (data.type === 'file-declined' && data.transferId === transferId) {
              console.log(`File transfer declined for ${transferId}`);
              // Restore original callback
              this.onFileTransferCallback = originalCallback;
              console.log(`File transfer declined by ${peerId}`);
              resolve(false);
            }
          }
        };

        // Timeout after 30 seconds if no response
        setTimeout(() => {
          // Restore original callback
          this.onFileTransferCallback = originalCallback;
          console.log(`File offer timeout for ${peerId}`);
          resolve(false);
        }, 30000);

      } catch (error) {
        console.error(`Failed to send file metadata ${file.name}:`, error);
        resolve(false);
      }
    });
  }

  // Send file chunks after acceptance
  private async sendFileChunks(dataChannel: RTCDataChannel, file: File, transferId: string): Promise<boolean> {
    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const chunkSize = 16384; // 16KB chunks
      const totalChunks = Math.ceil(uint8Array.length / chunkSize);

      console.log(`Sending file ${file.name} (${file.size} bytes) in ${totalChunks} chunks`);

      // Send file in chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, uint8Array.length);
        const chunk = uint8Array.slice(start, end);

        // Send binary chunk data directly
        dataChannel.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));

        // Small delay to prevent overwhelming the channel
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      console.log(`File ${file.name} sent successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to send file chunks ${file.name}:`, error);
      return false;
    }
  }

  // Check if connected to peer
  isConnected(peerId: string): boolean {
    return this.connectionStates.get(peerId) === 'connected';
  }

  // Set callbacks
  onMessage(callback: (peerId: string, message: MessageData) => void) {
    this.onMessageCallback = callback;
  }

  onDeviceList(callback: (devices: Device[]) => void) {
    this.onDeviceListCallback = callback;
  }

  onFileTransfer(callback: (peerId: string, data: FileTransferData) => void) {
    this.onFileTransferCallback = callback;
  }

  // Set connection state callback
  onConnectionState(callback: (peerId: string, state: string) => void) {
    this.onConnectionStateCallback = callback;
  }

  // Cleanup
  destroy() {
    // Close all peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();

    // Remove device from Firebase
    remove(ref(this.database, `localfile/app/devices/${this.myDeviceId}`));
  }
}
