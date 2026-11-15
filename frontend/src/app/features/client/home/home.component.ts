import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { RideService } from '../../../core/services/ride.service';
import { SocketService } from '../../../core/services/socket.service';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService, ChatMessage } from '../../../core/services/chat.service';
import { VehicleType, RideResponse } from '../../../core/models/ride.model';

declare let L: any;

type BookingStep = 'search' | 'preview' | 'waiting' | 'accepted';

interface QuickDestination {
  name: string;
  subtext: string;
  price: string;
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  // Étape actuelle du flux de commande
  step: BookingStep = 'search';

  // Carte Leaflet et couches graphiques
  map: any;
  routePolyline: any;
  highlightPolyline: any;
  originMarker: any;
  destMarker: any;
  driverMarkers: any[] = [];
  radarCircle: any;

  // Formulaire et trajet
  destinationQuery = '';
  selectedVehicle: VehicleType = 'MOTO';
  estimatedPrice: number = 5.0;
  estimatedDistance: number = 4.2;
  estimatedDuration: number = 10;
  isEstimating = false;
  isGeocoding = false;
  searchError: string | null = null;

  // Positions GPS de départ (Position actuelle du client)
  origin = { address: 'El Menzah 6, Tunis', lat: 36.8345, lng: 10.1800 };

  // Position d'arrivée choisie
  destination = { address: 'Avenue Habib Bourguiba, Centre Ville', lat: 36.8008, lng: 10.1865 };

  // Suggestions populaires en Tunisie avec vraies coordonnées GPS
  recentTrips: QuickDestination[] = [
    { name: 'Avenue Habib Bourguiba', subtext: 'Centre Ville, Tunis', price: '5 - 8 TND', lat: 36.8008, lng: 10.1865 },
    { name: 'Les Berges du Lac 1', subtext: 'Affaires & Cafés', price: '6 - 9 TND', lat: 36.8320, lng: 10.2310 },
    { name: 'Les Berges du Lac 2', subtext: 'Ambassades & Boutiques', price: '7 - 10 TND', lat: 36.8455, lng: 10.2708 },
    { name: 'La Marsa Plage', subtext: 'Banlieue Nord, Tunis', price: '9 - 14 TND', lat: 36.8782, lng: 10.3247 },
    { name: 'Ennasr 2', subtext: 'Avenue Hédi Nouira', price: '4 - 7 TND', lat: 36.8422, lng: 10.1132 },
    { name: 'Centre Urbain Nord', subtext: 'Pôle Technologique & INSAT', price: '4 - 7 TND', lat: 36.8480, lng: 10.1980 },
    { name: 'Carthage Byrsa', subtext: 'Site Historique & Banlieue', price: '8 - 12 TND', lat: 36.8525, lng: 10.3233 },
    { name: 'Aéroport Tunis-Carthage', subtext: 'Terminal 1 & 2', price: '6 - 9 TND', lat: 36.8510, lng: 10.2272 }
  ];

  // Gestion de la demande en attente
  pendingRideId: number | null = null;
  acceptedDriverName = '';
  acceptedDriverVehicle = '';
  private pollInterval: any = null;
  private socketSub: Subscription | null = null;

  // --- Gestion du Chat & Reçu sur l'écran d'accueil ---
  isChatOpen: boolean = false;
  chatMessages: ChatMessage[] = [];
  newChatMessage: string = '';
  isSendingChat: boolean = false;
  hasNewReceipt: boolean = false;
  activeChatRideId: number | null = null;
  activeChatDriverName: string = 'Chauffeur MotoTaxi';

  constructor(
    private rideService: RideService,
    private socketService: SocketService,
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.socketService.connect();
    this.checkCompletedRideReceipt();

    // Écouter les notifications de clôture de course et reçus en temps réel
    this.socketService.listen<RideResponse>('ride:completed').subscribe((ride) => {
      if (ride) {
        this.hasNewReceipt = true;
        this.activeChatRideId = ride.id;
        if (ride.driverName) this.activeChatDriverName = ride.driverName;
        setTimeout(() => this.openChat(ride.id), 300);
      }
    });

    this.socketService.listen<RideResponse>('ride:done').subscribe((ride) => {
      if (ride) {
        this.hasNewReceipt = true;
        this.activeChatRideId = ride.id;
        if (ride.driverName) this.activeChatDriverName = ride.driverName;
        setTimeout(() => this.openChat(ride.id), 300);
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initMap();
      this.checkCompletedRideReceipt();
    }, 250);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.socketSub) {
      this.socketSub.unsubscribe();
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  /**
   * Initialisation de la carte Leaflet
   */
  private initMap(): void {
    if (typeof L === 'undefined') {
      setTimeout(() => this.initMap(), 250);
      return;
    }

    if (this.map) return;

    const mapElement = document.getElementById('clientMap');
    if (!mapElement) return;

    this.map = L.map('clientMap', {
      zoomControl: true,
      attributionControl: false
    }).setView([this.origin.lat, this.origin.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(this.map);

    // Marqueur de départ (Ma position actuelle)
    this.addOriginMarker();

    // Permettre à l'utilisateur de cliquer n'importe où sur la carte pour choisir sa destination
    this.map.on('click', (e: any) => {
      if (this.step === 'search' || this.step === 'preview') {
        this.setDestinationFromCoordinates(e.latlng.lat, e.latlng.lng);
      }
    });

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 300);
  }

  private addOriginMarker(): void {
    if (!this.map || typeof L === 'undefined') return;

    const originIcon = L.divIcon({
      className: 'marker-origin',
      html: `
        <div style="background: #10B981; border: 3px solid white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(16,185,129,0.5);">
          <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    if (this.originMarker) {
      this.map.removeLayer(this.originMarker);
    }
    this.originMarker = L.marker([this.origin.lat, this.origin.lng], { icon: originIcon })
      .bindPopup(`<b>Votre position</b><br>${this.origin.address}`)
      .addTo(this.map);
  }

  /**
   * Action: L'utilisateur tape une destination et clique sur "Rechercher"
   * Utilise le service de géocodage réel OpenStreetMap (Nominatim)
   */
  onSearchDestination(): void {
    if (!this.destinationQuery || !this.destinationQuery.trim()) {
      return;
    }

    const query = this.destinationQuery.trim();
    this.searchError = null;

    // 1. Vérifier d'abord si la saisie correspond exactement à une destination connue
    const match = this.recentTrips.find(t => 
      t.name.toLowerCase().includes(query.toLowerCase()) || 
      query.toLowerCase().includes(t.name.toLowerCase())
    );

    if (match) {
      this.applyDestination(match.name, match.lat, match.lng);
      return;
    }

    // 2. Géocodage réel via l'API Nominatim (OpenStreetMap)
    this.isGeocoding = true;
    const searchTarget = query.toLowerCase().includes('tunis') ? query : `${query}, Tunisie`;
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchTarget)}&countrycodes=tn&limit=3`;

    this.http.get<any[]>(nominatimUrl).subscribe({
      next: (results) => {
        this.isGeocoding = false;
        if (results && results.length > 0) {
          const firstResult = results[0];
          const lat = parseFloat(firstResult.lat);
          const lng = parseFloat(firstResult.lon);
          
          // Formatter un nom lisible à partir de la réponse
          const cleanName = firstResult.display_name.split(',').slice(0, 3).join(', ');
          this.applyDestination(cleanName, lat, lng);
        } else {
          // Deuxième tentative sans restreindre au pays
          this.fallbackGlobalSearch(query);
        }
      },
      error: (err) => {
        console.warn('Erreur geocoding Nominatim, essai recherche globale:', err);
        this.fallbackGlobalSearch(query);
      }
    });
  }

  /**
   * Recherche de secours sans filtre de pays
   */
  private fallbackGlobalSearch(query: string): void {
    const globalUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    this.http.get<any[]>(globalUrl).subscribe({
      next: (res) => {
        this.isGeocoding = false;
        if (res && res.length > 0) {
          const lat = parseFloat(res[0].lat);
          const lng = parseFloat(res[0].lon);
          const name = res[0].display_name.split(',').slice(0, 2).join(', ');
          this.applyDestination(name, lat, lng);
        } else {
          this.searchError = `Lieu introuvable pour "${query}". Essayez avec le nom d'un quartier ou d'une ville (ex: Ariana, Marsa, Lac 2). Vous pouvez aussi cliquer directement sur la carte !`;
        }
      },
      error: () => {
        this.isGeocoding = false;
        this.searchError = `Impossible de contacter le service de géocodage. Vous pouvez cliquer directement sur la carte pour définir la destination.`;
      }
    });
  }

  /**
   * Permet de choisir une destination par simple clic sur la carte Leaflet
   */
  setDestinationFromCoordinates(lat: number, lng: number): void {
    this.searchError = null;
    const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    
    // Adresse par défaut pendant le reverse-geocoding
    const approxName = `Point GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    this.destinationQuery = approxName;
    this.applyDestination(approxName, lat, lng);

    this.http.get<any>(reverseUrl).subscribe({
      next: (data) => {
        if (data && data.display_name) {
          const prettyAddress = data.display_name.split(',').slice(0, 3).join(', ');
          this.destination.address = prettyAddress;
          this.destinationQuery = prettyAddress;
          if (this.destMarker) {
            this.destMarker.bindPopup(`<b>Destination choisie:</b><br>${prettyAddress}`).openPopup();
          }
        }
      },
      error: () => {}
    });
  }

  /**
   * Clic sur un trajet rapide suggéré
   */
  selectQuickTrip(trip: QuickDestination): void {
    this.destinationQuery = trip.name;
    this.applyDestination(trip.name, trip.lat, trip.lng);
  }

  /**
   * Appliquer une destination, positionner le marqueur, tracer la route et calculer le prix réel
   */
  private applyDestination(address: string, lat: number, lng: number): void {
    this.destination = { address, lat, lng };
    this.step = 'preview';

    // Mettre à jour l'affichage sur la carte
    this.drawTrajectory();
    this.showNearbyVehicles();

    // Calculer le prix et la distance réels via l'API Spring Boot
    this.fetchEstimate();
  }

  /**
   * Dessiner le trajet de la position actuelle vers la destination réelle
   */
  private drawTrajectory(): void {
    if (!this.map || typeof L === 'undefined') return;

    // Supprimer les anciens tracés
    if (this.routePolyline) this.map.removeLayer(this.routePolyline);
    if (this.highlightPolyline) this.map.removeLayer(this.highlightPolyline);
    if (this.destMarker) this.map.removeLayer(this.destMarker);

    // Marqueur de destination avec pin jaune et popup
    const destIcon = L.divIcon({
      className: 'marker-dest',
      html: `
        <div style="background: #1A1A1A; border: 3px solid #F5C518; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.5);">
          <i class="fa-solid fa-location-dot" style="color: #F5C518; font-size: 16px;"></i>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    this.destMarker = L.marker([this.destination.lat, this.destination.lng], { icon: destIcon })
      .bindPopup(`<b>Destination :</b><br>${this.destination.address}`)
      .addTo(this.map);

    // Calculer un tracé routier fluide avec point intermédiaire réaliste
    const midLat = (this.origin.lat + this.destination.lat) / 2;
    const midLng = (this.origin.lng + this.destination.lng) / 2 + 0.002;

    const pathPoints = [
      [this.origin.lat, this.origin.lng],
      [midLat, midLng],
      [this.destination.lat, this.destination.lng]
    ];

    // Tracé de fond noir
    this.routePolyline = L.polyline(pathPoints, {
      color: '#1A1A1A',
      weight: 6,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(this.map);

    // Tracé central jaune lumineux en pointillés
    this.highlightPolyline = L.polyline(pathPoints, {
      color: '#F5C518',
      weight: 4,
      dashArray: '8, 6',
      opacity: 1
    }).addTo(this.map);

    // Recadrer automatiquement la carte pour afficher l'origine ET la destination
    const bounds = L.latLngBounds([
      [this.origin.lat, this.origin.lng],
      [this.destination.lat, this.destination.lng]
    ]);
    this.map.fitBounds(bounds, { padding: [70, 70], maxZoom: 15 });
  }

  /**
   * Afficher les chauffeurs de la catégorie choisie (Moto, Taxi, Express)
   */
  showNearbyVehicles(): void {
    if (!this.map || typeof L === 'undefined') return;

    this.driverMarkers.forEach(m => this.map.removeLayer(m));
    this.driverMarkers = [];

    let iconClass = 'fa-motorcycle';
    if (this.selectedVehicle === 'TAXI') {
      iconClass = 'fa-taxi';
    } else if (this.selectedVehicle === 'EXPRESS') {
      iconClass = 'fa-truck-fast';
    }

    const vehicleIcon = L.divIcon({
      className: 'vehicle-marker',
      html: `
        <div style="background: #F5C518; border: 2px solid #1A1A1A; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          <i class="fa-solid ${iconClass}" style="color: #1A1A1A; font-size: 14px;"></i>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const nearbyPoints = [
      [this.origin.lat + 0.0035, this.origin.lng - 0.0025],
      [this.origin.lat - 0.0040, this.origin.lng + 0.0045],
      [this.origin.lat + 0.0018, this.origin.lng + 0.0050]
    ];

    nearbyPoints.forEach(p => {
      const marker = L.marker(p, { icon: vehicleIcon }).addTo(this.map);
      this.driverMarkers.push(marker);
    });
  }

  selectVehicle(type: VehicleType): void {
    this.selectedVehicle = type;
    this.showNearbyVehicles();
    this.fetchEstimate();
  }

  /**
   * Appel backend Spring Boot pour calculer la distance réelle et le prix exact
   */
  fetchEstimate(): void {
    this.isEstimating = true;
    this.rideService.estimatePrice({
      originLat: this.origin.lat,
      originLng: this.origin.lng,
      destLat: this.destination.lat,
      destLng: this.destination.lng,
      vehicleType: this.selectedVehicle
    }).subscribe({
      next: (est) => {
        this.isEstimating = false;
        if (est) {
          this.estimatedPrice = est.estimatedPrice || 5.0;
          this.estimatedDistance = est.distance || 4.2;
          this.estimatedDuration = est.durationMinutes || 10;
        }
      },
      error: () => {
        this.isEstimating = false;
      }
    });
  }

  /**
   * Action: Confirmer la commande et passer en mode "En attente d'un chauffeur"
   */
  confirmBookingAndSearchDriver(): void {
    this.isEstimating = true;

    const req = {
      originAddress: this.origin.address,
      originLat: this.origin.lat,
      originLng: this.origin.lng,
      destAddress: this.destination.address,
      destLat: this.destination.lat,
      destLng: this.destination.lng,
      vehicleType: this.selectedVehicle,
      customerId: this.authService.currentUser()?.userId || 2
    };

    this.rideService.requestRide(req).subscribe({
      next: (createdRide) => {
        this.isEstimating = false;
        this.pendingRideId = createdRide.id;
        this.step = 'waiting';

        // Lancer le radar visuel sur la carte
        this.startRadarAnimation();

        // Écouter via WebSocket et Polling
        this.listenForDriverAcceptance(createdRide.id);
      },
      error: (err) => {
        console.error('Erreur création commande:', err);
        this.isEstimating = false;
      }
    });
  }

  /**
   * Animation du radar de recherche sur la carte
   */
  private startRadarAnimation(): void {
    if (!this.map || typeof L === 'undefined') return;

    if (this.radarCircle) {
      this.map.removeLayer(this.radarCircle);
    }

    this.radarCircle = L.circle([this.origin.lat, this.origin.lng], {
      color: '#F5C518',
      fillColor: '#F5C518',
      fillOpacity: 0.15,
      radius: 650
    }).addTo(this.map);

    this.map.setView([this.origin.lat, this.origin.lng], 15);
  }

  /**
   * Attendre qu'un vrai chauffeur accepte la demande
   */
  private listenForDriverAcceptance(rideId: number): void {
    // 1. WebSocket : rejoindre la room de la course
    this.socketService.connect();
    this.socketService.emit('ride:join', { rideId });

    // Écouter l'événement temps réel d'acceptation
    this.socketSub = this.socketService.listen<RideResponse>('ride:driverAccepted').subscribe((ride) => {
      if (ride && ride.id === rideId) {
        this.onDriverAccepted(ride);
      }
    });

    // 2. Polling de sécurité toutes les 2 secondes (si le websocket a du retard)
    this.pollInterval = setInterval(() => {
      this.rideService.getRideById(rideId).subscribe({
        next: (currentRide) => {
          if (currentRide && (currentRide.status === 'ACCEPTED' || currentRide.status === 'IN_PROGRESS')) {
            this.onDriverAccepted(currentRide);
          }
        },
        error: () => {}
      });
    }, 2000);
  }

  /**
   * Déclenché quand le chauffeur accepte la course !
   */
  private onDriverAccepted(ride: RideResponse): void {
    this.stopPolling();
    this.step = 'accepted';
    this.acceptedDriverName = ride.driverName || 'Chauffeur Partenaire';
    this.acceptedDriverVehicle = (ride.vehicleType || this.selectedVehicle) + ' MotoTaxi';

    // Rediriger vers l'écran de suivi en direct après 1.5 seconde
    setTimeout(() => {
      this.router.navigate(['/client/tracking', ride.id]);
    }, 1500);
  }

  /**
   * Annuler la recherche en cours
   */
  cancelSearch(): void {
    this.stopPolling();
    if (this.pendingRideId) {
      this.rideService.cancelRide(this.pendingRideId).subscribe({
        error: () => {}
      });
    }

    if (this.radarCircle && this.map) {
      this.map.removeLayer(this.radarCircle);
      this.radarCircle = null;
    }

    this.step = 'search';
    this.pendingRideId = null;
    this.destinationQuery = '';
    this.searchError = null;

    if (this.routePolyline && this.map) this.map.removeLayer(this.routePolyline);
    if (this.highlightPolyline && this.map) this.map.removeLayer(this.highlightPolyline);
    if (this.destMarker && this.map) this.map.removeLayer(this.destMarker);

    this.driverMarkers.forEach(m => this.map.removeLayer(m));
    this.driverMarkers = [];

    this.map?.setView([this.origin.lat, this.origin.lng], 13);
  }

  /**
   * Modifier la destination (retourner à l'étape de recherche)
   */
  changeDestination(): void {
    this.step = 'search';
    this.searchError = null;
    if (this.routePolyline && this.map) this.map.removeLayer(this.routePolyline);
    if (this.highlightPolyline && this.map) this.map.removeLayer(this.highlightPolyline);
    if (this.destMarker && this.map) this.map.removeLayer(this.destMarker);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // ==========================================
  // GESTION DE LA BOÎTE DE CHAT ET DES REÇUS
  // ==========================================

  checkCompletedRideReceipt(): void {
    const showReceipt = localStorage.getItem('mototaxi_show_receipt');
    const rideIdStr = localStorage.getItem('mototaxi_last_ride_id');
    const receiptDataStr = localStorage.getItem('mototaxi_receipt_data');

    if (showReceipt === 'true' && rideIdStr) {
      this.hasNewReceipt = true;
      this.activeChatRideId = Number(rideIdStr);
      if (receiptDataStr) {
        try {
          const r = JSON.parse(receiptDataStr);
          if (r.driverName) this.activeChatDriverName = r.driverName;
        } catch {}
      }
      localStorage.removeItem('mototaxi_show_receipt');
      // Ouvrir automatiquement le tiroir de messages avec le reçu officiel
      setTimeout(() => {
        this.openChat(this.activeChatRideId!);
      }, 400);
      return;
    }

    // Si l'utilisateur revient sur l'accueil, précharger la dernière course effectuée
    const user = this.authService.currentUser();
    const customerId = user?.userId || 2;
    this.rideService.getCustomerRides(customerId).subscribe({
      next: (rides) => {
        if (rides && rides.length > 0) {
          const latest = rides[0];
          this.activeChatRideId = latest.id;
          if (latest.driverName) this.activeChatDriverName = latest.driverName;
          if (latest.status === 'COMPLETED') {
            this.hasNewReceipt = true;
          }
        }
      },
      error: () => {}
    });
  }

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.hasNewReceipt = false;
      if (this.activeChatRideId) {
        this.loadChatMessages(this.activeChatRideId);
      } else {
        // Récupérer la dernière course du client pour afficher ses messages et reçus
        const user = this.authService.currentUser();
        const customerId = user?.userId || 2;
        this.rideService.getCustomerRides(customerId).subscribe({
          next: (rides) => {
            if (rides && rides.length > 0) {
              this.activeChatRideId = rides[0].id;
              if (rides[0].driverName) this.activeChatDriverName = rides[0].driverName;
              this.loadChatMessages(this.activeChatRideId);
            }
          },
          error: () => {}
        });
      }
    }
  }

  openChat(rideId: number): void {
    this.activeChatRideId = rideId;
    this.isChatOpen = true;
    this.hasNewReceipt = false;
    this.loadChatMessages(rideId);
  }

  loadChatMessages(rideId: number): void {
    this.chatService.getMessages(rideId).subscribe({
      next: (msgs) => {
        this.chatMessages = msgs || [];
      },
      error: (err) => console.error('Erreur chargement chat:', err)
    });
  }

  sendChatMessage(): void {
    if (!this.newChatMessage || !this.newChatMessage.trim() || !this.activeChatRideId || this.isSendingChat) return;

    const user = this.authService.currentUser();
    const senderName = user?.fullName || 'Client';
    const senderId = user?.userId || 2;
    const text = this.newChatMessage.trim();

    this.isSendingChat = true;
    this.chatService.sendMessage(this.activeChatRideId, text, senderName, 'CUSTOMER', senderId).subscribe({
      next: (msg) => {
        this.isSendingChat = false;
        this.newChatMessage = '';
        if (!this.chatMessages.some(m => m.id === msg.id)) {
          this.chatMessages.push(msg);
        }
      },
      error: (err) => {
        console.error('Erreur envoi chat:', err);
        this.isSendingChat = false;
      }
    });
  }

  isReceiptMessage(msg: ChatMessage): boolean {
    return msg.senderRole === 'SYSTEM' || (msg.content && msg.content.includes('REÇU OFFICIEL'));
  }
}
