import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { SocketService } from '../../../core/services/socket.service';
import { RideService } from '../../../core/services/ride.service';
import { ChatService, ChatMessage } from '../../../core/services/chat.service';
import { AuthService } from '../../../core/services/auth.service';
import { RideResponse } from '../../../core/models/ride.model';

declare let L: any;

@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './tracking.component.html',
  styleUrls: ['./tracking.component.scss']
})
export class TrackingComponent implements OnInit, AfterViewInit, OnDestroy {
  map: any;
  driverMarker: any;
  routeLine: any;

  rideId: number = 1;
  ride: RideResponse | null = null;

  statusText = 'Chauffeur en route...';
  etaMinutes = 4;
  driverName = 'En attente du chauffeur...';
  vehiclePlate = '—';
  vehicleType = 'MotoTaxi';
  rating = 4.9;
  sosTriggered = false;

  originAddress = 'El Menzah 6, Tunis';
  destAddress = 'Avenue Habib Bourguiba, Centre Ville';

  isCompleted: boolean = false;
  completedRide: RideResponse | null = null;
  private pollInterval: any = null;

  isChatOpen: boolean = false;
  chatMessages: ChatMessage[] = [];
  newTextMessage: string = '';
  isSendingMessage: boolean = false;

  private socketSub: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService,
    private rideService: RideService,
    private chatService: ChatService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const param = this.route.snapshot.paramMap.get('id');
    if (param) this.rideId = +param;

    this.loadRideDetails();
    this.initSocket();

    this.pollInterval = setInterval(() => {
      this.rideService.getRideById(this.rideId).subscribe({
        next: (data) => {
          if (data && data.status === 'COMPLETED') {
            this.handleRideFinished(data);
          }
        },
        error: () => {}
      });
    }, 2000);
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initMap();
    }, 250);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.socketSub) {
      this.socketSub.unsubscribe();
    }
    if (this.map) {
      this.map.remove();
    }
  }

  loadRideDetails(): void {
    this.rideService.getRideById(this.rideId).subscribe({
      next: (data) => {
        if (data) {
          this.ride = data;
          this.originAddress = data.originAddress || this.originAddress;
          this.destAddress = data.destAddress || this.destAddress;
          if (data.driverName) this.driverName = data.driverName;
          if (data.driverPlate) this.vehiclePlate = data.driverPlate;
          if (data.vehicleType) {
            this.vehicleType = (data.vehicleType === 'MOTO' ? 'Moto' : (data.vehicleType === 'TAXI' ? 'Taxi' : 'Express')) + ' MotoTaxi';
          }

          if (data.status === 'ACCEPTED') {
            this.statusText = 'Chauffeur assigné, en route vers vous...';
          } else if (data.status === 'IN_PROGRESS') {
            this.statusText = 'Course en cours de trajet...';
          } else if (data.status === 'COMPLETED') {
            this.statusText = 'Course terminée avec succès !';
          }

          this.renderRideOnMap();
        }
      },
      error: () => {}
    });
  }

  private initMap(): void {
    if (typeof L === 'undefined') return;

    const mapEl = document.getElementById('trackingMap');
    if (!mapEl) return;

    this.map = L.map('trackingMap', {
      zoomControl: true,
      attributionControl: false
    }).setView([36.8200, 10.1800], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this.map);

    this.renderRideOnMap();
  }

  private renderRideOnMap(): void {
    if (!this.map || typeof L === 'undefined') return;

    const originLat = this.ride?.originLat || 36.8345;
    const originLng = this.ride?.originLng || 10.1800;
    const destLat = this.ride?.destLat || 36.8008;
    const destLng = this.ride?.destLng || 10.1865;

    const clientPos = [originLat, originLng];
    const destPos = [destLat, destLng];

    const midLat = (originLat + destLat) / 2;
    const midLng = (originLng + destLng) / 2;

    const motoIcon = L.divIcon({
      className: 'live-moto-marker',
      html: `
        <div style="background: #F5C518; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.35); border: 3px solid white;">
          <i class="fa-solid fa-motorcycle" style="color: #111; font-size: 16px;"></i>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    if (!this.driverMarker) {
      this.driverMarker = L.marker([midLat, midLng], { icon: motoIcon }).addTo(this.map);
    } else {
      this.driverMarker.setLatLng([midLat, midLng]);
    }

    const clientIcon = L.divIcon({
      className: 'client-pos-marker',
      html: `
        <div style="background: #10B981; border: 3px solid white; border-radius: 50%; width: 28px; height: 28px; box-shadow: 0 3px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
          <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    L.marker(clientPos, { icon: clientIcon })
      .bindPopup(`<b>Départ :</b><br>${this.originAddress}`)
      .addTo(this.map);

    const destIcon = L.divIcon({
      className: 'dest-pos-marker',
      html: `
        <div style="background: #1A1A1A; border: 3px solid #F5C518; border-radius: 50%; width: 34px; height: 34px; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
          <i class="fa-solid fa-location-dot" style="color: #F5C518; font-size: 16px;"></i>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
    L.marker(destPos, { icon: destIcon })
      .bindPopup(`<b>Arrivée :</b><br>${this.destAddress}`)
      .addTo(this.map);

    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
    }

    this.routeLine = L.polyline([clientPos, [midLat, midLng], destPos], {
      color: '#F5C518',
      weight: 5,
      dashArray: '8, 8'
    }).addTo(this.map);

    const bounds = L.latLngBounds([clientPos, destPos]);
    this.map.fitBounds(bounds, { padding: [60, 60] });
  }

  private initSocket(): void {
    this.socketService.connect();

    this.socketService.emit('ride:join', { rideId: this.rideId });

    this.socketService.listen<any>('driver:locationUpdated').subscribe((loc) => {
      if (this.driverMarker && loc.lat && loc.lng) {
        this.driverMarker.setLatLng([loc.lat, loc.lng]);
      }
    });

    this.socketService.listen<RideResponse>('ride:driverAccepted').subscribe((r) => {
      if (r && (r.id === this.rideId || !this.rideId)) {
        this.ride = r;
        if (r.driverName) this.driverName = r.driverName;
        if (r.driverPlate) this.vehiclePlate = r.driverPlate;
        if (r.vehicleType) {
          this.vehicleType = (r.vehicleType === 'MOTO' ? 'Moto' : (r.vehicleType === 'TAXI' ? 'Taxi' : 'Express')) + ' MotoTaxi';
        }
        this.statusText = 'Chauffeur assigné, en route vers vous...';
      }
    });

    this.socketService.listen<RideResponse>('ride:accepted').subscribe((r) => {
      if (r && (r.id === this.rideId || !this.rideId)) {
        this.ride = r;
        if (r.driverName) this.driverName = r.driverName;
        if (r.driverPlate) this.vehiclePlate = r.driverPlate;
        if (r.vehicleType) {
          this.vehicleType = (r.vehicleType === 'MOTO' ? 'Moto' : (r.vehicleType === 'TAXI' ? 'Taxi' : 'Express')) + ' MotoTaxi';
        }
        this.statusText = 'Chauffeur assigné, en route vers vous...';
      }
    });

    this.socketService.listen<ChatMessage>('chat:message').subscribe((msg) => {
      if (msg && msg.rideId === this.rideId) {
        this.chatMessages.push(msg);
      }
    });

    this.socketService.listen<RideResponse>('ride:completed').subscribe((ride) => {
      if (ride && ride.id === this.rideId) {
        this.handleRideFinished(ride);
      }
    });

    this.socketService.listen<RideResponse>('ride:done').subscribe((ride) => {
      if (ride && ride.id === this.rideId) {
        this.handleRideFinished(ride);
      }
    });
  }

  handleRideFinished(ride: RideResponse): void {
    if (this.isCompleted) return;
    this.isCompleted = true;
    this.completedRide = ride;
    this.statusText = 'Course terminée avec succès !';

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    localStorage.setItem('mototaxi_show_receipt', 'true');
    localStorage.setItem('mototaxi_last_ride_id', String(this.rideId));
    localStorage.setItem('mototaxi_receipt_data', JSON.stringify(ride));

    setTimeout(() => {
      this.returnToMainScreen();
    }, 3200);
  }

  returnToMainScreen(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.router.navigate(['/client/home']);
  }

  cancelOrExitRide(): void {
    if (this.isCompleted || this.ride?.status === 'COMPLETED') {
      this.returnToMainScreen();
      return;
    }
    this.rideService.cancelRide(this.rideId).subscribe({
      next: () => this.returnToMainScreen(),
      error: () => this.returnToMainScreen()
    });
  }

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.loadMessages();
    }
  }

  loadMessages(): void {
    this.chatService.getMessages(this.rideId).subscribe({
      next: (msgs) => {
        this.chatMessages = msgs || [];
      },
      error: (err) => console.error('Erreur chargement chat:', err)
    });
  }

  sendChatMessage(): void {
    if (!this.newTextMessage || !this.newTextMessage.trim() || this.isSendingMessage) return;

    const user = this.authService.currentUser();
    const senderName = user?.fullName || 'Client';
    const senderId = user?.userId || 2;
    const text = this.newTextMessage.trim();

    this.isSendingMessage = true;

    this.chatService.sendMessage(this.rideId, text, senderName, 'CUSTOMER', senderId).subscribe({
      next: (msg) => {
        this.isSendingMessage = false;
        this.newTextMessage = '';
        if (!this.chatMessages.some(m => m.id === msg.id)) {
          this.chatMessages.push(msg);
        }
      },
      error: (err) => {
        console.error('Erreur envoi message:', err);
        this.isSendingMessage = false;
      }
    });
  }

  sendQuickReply(text: string): void {
    this.newTextMessage = text;
    this.sendChatMessage();
  }

  triggerSOS(): void {
    this.sosTriggered = true;
    this.socketService.emit('customer:sos', {
      rideId: this.rideId,
      customerId: 2,
      lat: 36.8150,
      lng: 10.1800,
      timestamp: new Date()
    });
  }
}
