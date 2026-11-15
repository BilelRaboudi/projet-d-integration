import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SocketService } from '../../../core/services/socket.service';
import { DriverService } from '../../../core/services/driver.service';
import { RideService } from '../../../core/services/ride.service';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService, ChatMessage } from '../../../core/services/chat.service';
import { RideResponse } from '../../../core/models/ride.model';

@Component({
  selector: 'app-driver-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  driverId: number = 1;
  driverVehicleType: string = 'MOTO';
  todayEarnings: number = 0.0;
  totalEarnings: number = 0.0;
  todayRidesCount: number = 0;
  driverRating: number = 4.9;
  isOnline: boolean = true;

  // Course en cours acceptée depuis la base de données
  activeRide: RideResponse | null = null;
  lastCompletedRide: RideResponse | null = null;

  // Nouvelle demande en temps réel
  hasNewRequest: boolean = false;
  incomingRequest: RideResponse | null = null;

  // Trajets récents
  recentTrips: any[] = [];

  // --- Messagerie Chauffeur <-> Client ---
  isChatOpen: boolean = false;
  chatMessages: ChatMessage[] = [];
  newTextMessage: string = '';
  isSendingMessage: boolean = false;

  private socketSub: Subscription | null = null;

  constructor(
    private authService: AuthService,
    private socketService: SocketService,
    private driverService: DriverService,
    private rideService: RideService,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    this.initDriver();
    this.initSocketListener();
  }

  ngOnDestroy(): void {
    if (this.socketSub) {
      this.socketSub.unsubscribe();
    }
  }

  /**
   * Charger le profil du chauffeur connecté
   */
  initDriver(): void {
    const user = this.authService.currentUser();
    if (user?.userId) {
      this.driverService.getDriverByUserId(user.userId).subscribe({
        next: (driver) => {
          if (driver) {
            this.driverId = driver.id;
            this.driverVehicleType = driver.vehicleType || 'MOTO';
            this.totalEarnings = driver.totalEarnings || 0.0;
            this.isOnline = driver.available;
            this.loadDriverData();
            this.checkActiveRide();
          }
        },
        error: () => this.loadDriverData()
      });
    } else {
      this.loadDriverData();
    }
  }

  loadDriverData(): void {
    this.driverService.getDriverDashboardStats(this.driverId).subscribe({
      next: (stats) => {
        if (stats) {
          this.todayEarnings = stats.todayEarnings ?? 0.0;
          this.totalEarnings = stats.totalEarnings ?? this.totalEarnings;
          this.todayRidesCount = stats.todayRidesCount ?? 0;
          this.driverRating = stats.driverRating ?? 4.9;
          this.isOnline = stats.isAvailable !== undefined ? stats.isAvailable : true;

          if (stats.recentTrips && stats.recentTrips.length > 0) {
            this.recentTrips = stats.recentTrips.map((r: any) => ({
              id: r.id,
              time: r.requestedAt ? new Date(r.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Récent',
              origin: r.originAddress,
              destination: r.destAddress,
              price: r.finalPrice || r.estimatedPrice,
              status: r.status
            }));
          }
        }
      },
      error: (err) => console.error('Erreur chargement stats chauffeur:', err)
    });
  }

  checkActiveRide(): void {
    this.rideService.getActiveRideForDriver(this.driverId).subscribe({
      next: (ride) => {
        if (ride && (ride.status === 'ACCEPTED' || ride.status === 'IN_PROGRESS')) {
          this.activeRide = ride;
          this.hasNewRequest = false;
          this.incomingRequest = null;
          // Rejoindre la room de messagerie de la course
          this.socketService.emit('ride:join', { rideId: ride.id });
        } else {
          this.activeRide = null;
          this.checkForPendingDemands();
        }
      },
      error: () => {
        this.checkForPendingDemands();
      }
    });
  }

  /**
   * Charger les demandes en attente qui correspondent au véhicule du chauffeur
   */
  checkForPendingDemands(): void {
    if (this.activeRide) {
      this.hasNewRequest = false;
      this.incomingRequest = null;
      return;
    }

    this.rideService.getPendingRides().subscribe({
      next: (rides) => {
        if (this.activeRide) {
          this.hasNewRequest = false;
          this.incomingRequest = null;
          return;
        }
        // Filtrer uniquement par catégorie de véhicule (MOTO, TAXI, EXPRESS)
        const matching = (rides || []).filter(r => !r.vehicleType || r.vehicleType === this.driverVehicleType);
        if (matching.length > 0) {
          this.incomingRequest = matching[0];
          this.hasNewRequest = true;
        } else {
          this.hasNewRequest = false;
          this.incomingRequest = null;
        }
      },
      error: () => {}
    });
  }

  initSocketListener(): void {
    this.socketService.connect();

    // Écouter les nouvelles demandes en temps réel
    this.socketSub = this.socketService.listen<any>('ride:incomingRequest').subscribe((req) => {
      // Filtrer : seuls les chauffeurs avec la même catégorie de véhicule reçoivent l'alerte
      if (!this.activeRide && (!req.vehicleType || req.vehicleType === this.driverVehicleType)) {
        this.hasNewRequest = true;
        this.incomingRequest = req;
      }
    });

    // Écouter les messages de chat envoyés par le client
    this.socketService.listen<ChatMessage>('chat:message').subscribe((msg) => {
      if (this.activeRide && msg && msg.rideId === this.activeRide.id) {
        if (!this.chatMessages.some(m => m.id === msg.id)) {
          this.chatMessages.push(msg);
        }
      }
    });
  }

  acceptRequest(): void {
    if (!this.incomingRequest) return;

    const rideId = this.incomingRequest.id;
    this.rideService.acceptRide(rideId, this.driverId).subscribe({
      next: (acceptedRide) => {
        this.activeRide = acceptedRide;
        this.hasNewRequest = false;
        this.incomingRequest = null;
        this.loadDriverData();

        this.socketService.emit('ride:join', { rideId: rideId });
        this.socketService.emit('ride:accepted', {
          rideId: rideId,
          driverId: this.driverId
        });
      },
      error: (err) => {
        console.error('Erreur acceptation:', err);
        this.checkForPendingDemands();
      }
    });
  }

  ignoreRequest(): void {
    if (this.incomingRequest) {
      this.socketService.emit('ride:rejected', {
        rideId: this.incomingRequest.id,
        driverId: this.driverId
      });
    }
    this.hasNewRequest = false;
    this.incomingRequest = null;
  }

  startActiveRide(): void {
    if (!this.activeRide) return;

    this.rideService.startRide(this.activeRide.id).subscribe({
      next: (updatedRide) => {
        this.activeRide = updatedRide;
      },
      error: (err) => console.error('Erreur démarrage course:', err)
    });
  }

  completeActiveRide(): void {
    if (!this.activeRide) return;

    const completedRide = { ...this.activeRide };
    const rideId = this.activeRide.id;

    this.rideService.completeRide(rideId).subscribe({
      next: () => {
        this.lastCompletedRide = completedRide;
        this.activeRide = null;
        this.loadDriverData();
        this.checkForPendingDemands();
        // Charger les messages et le reçu pour ce trajet
        this.loadMessages(rideId);
      },
      error: (err) => console.error('Erreur clôture course:', err)
    });
  }

  // --- Gestion du Chat Chauffeur ---

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      const target = this.activeRide || this.lastCompletedRide;
      if (target) {
        this.loadMessages(target.id);
      } else {
        // Récupérer la dernière course effectuée par ce chauffeur pour charger ses messages/reçus
        this.rideService.getDriverRides(this.driverId).subscribe({
          next: (rides) => {
            if (rides && rides.length > 0) {
              this.lastCompletedRide = rides[0];
              this.loadMessages(rides[0].id);
            }
          },
          error: () => {}
        });
      }
    }
  }

  loadMessages(rideId?: number): void {
    const targetId = rideId || this.activeRide?.id || this.lastCompletedRide?.id;
    if (!targetId) return;

    this.chatService.getMessages(targetId).subscribe({
      next: (msgs) => {
        this.chatMessages = msgs || [];
      },
      error: (err) => console.error('Erreur chargement chat:', err)
    });
  }

  sendChatMessage(): void {
    const target = this.activeRide || this.lastCompletedRide;
    if (!target || !this.newTextMessage.trim() || this.isSendingMessage) return;

    const user = this.authService.currentUser();
    const senderName = user?.fullName || 'Chauffeur';
    const text = this.newTextMessage.trim();

    this.isSendingMessage = true;

    this.chatService.sendMessage(target.id, text, senderName, 'DRIVER', this.driverId).subscribe({
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

  isReceiptMessage(msg: ChatMessage): boolean {
    return msg.senderRole === 'SYSTEM' || (msg.content && msg.content.includes('REÇU OFFICIEL'));
  }

  sendQuickReply(text: string): void {
    this.newTextMessage = text;
    this.sendChatMessage();
  }

  getClientDisplayName(): string {
    const currentDriverUser = this.authService.currentUser();
    const currentDriverName = currentDriverUser?.fullName || 'Amine Jlassi';

    // 1. Look at customerName from activeRide or lastCompletedRide
    const clientName = this.activeRide?.customerName || this.lastCompletedRide?.customerName;
    if (clientName && clientName.trim() !== '' && clientName !== currentDriverName) {
      return clientName;
    }

    // 2. If it matches the driver's own name, search through chat messages for the customer's name
    const customerMsg = this.chatMessages.find(
      (m) => m.senderRole === 'CUSTOMER' && m.senderName && m.senderName !== currentDriverName
    );
    if (customerMsg && customerMsg.senderName) {
      return customerMsg.senderName;
    }

    // 3. Fallback to client name
    return 'Sami Ben Salah';
  }
}
