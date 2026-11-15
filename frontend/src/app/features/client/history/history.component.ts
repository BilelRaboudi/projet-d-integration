import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RideService } from '../../../core/services/ride.service';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService, ChatMessage } from '../../../core/services/chat.service';
import { RideResponse } from '../../../core/models/ride.model';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6 animate-fadeIn pb-12">
      
      <!-- En-tête de la page Historique -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2.5 h-2.5 rounded-full bg-[#F5C518]"></span>
            <span class="text-xs font-black uppercase text-[#F5C518] tracking-wider">Espace Client</span>
          </div>
          <h2 class="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Historique & Reçus de vos courses</h2>
          <p class="text-xs text-gray-400 mt-0.5">Consultez l'historique complet de vos trajets récents et téléchargez vos reçus officiels</p>
        </div>

        <div class="flex items-center gap-3">
          <button 
            (click)="loadRides()" 
            [disabled]="loading"
            class="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-bold transition flex items-center gap-2">
            <i class="fa-solid fa-arrows-rotate" [ngClass]="{'animate-spin': loading}"></i>
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      <!-- Filtres par statut -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button 
          (click)="filterStatus = 'ALL'"
          [ngClass]="filterStatus === 'ALL' ? 'bg-[#1A1A1A] text-[#F5C518] shadow' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'"
          class="px-4 py-2 rounded-xl font-bold transition whitespace-nowrap">
          Toutes les courses ({{ rides.length }})
        </button>
        <button 
          (click)="filterStatus = 'COMPLETED'"
          [ngClass]="filterStatus === 'COMPLETED' ? 'bg-emerald-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'"
          class="px-4 py-2 rounded-xl font-bold transition whitespace-nowrap flex items-center gap-1.5">
          <i class="fa-solid fa-receipt text-xs"></i>
          <span>Terminées avec Reçu ({{ getCount('COMPLETED') }})</span>
        </button>
        <button 
          (click)="filterStatus = 'IN_PROGRESS'"
          [ngClass]="filterStatus === 'IN_PROGRESS' ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'"
          class="px-4 py-2 rounded-xl font-bold transition whitespace-nowrap">
          En cours ({{ getCount('IN_PROGRESS') + getCount('ACCEPTED') }})
        </button>
        <button 
          (click)="filterStatus = 'CANCELLED'"
          [ngClass]="filterStatus === 'CANCELLED' ? 'bg-red-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'"
          class="px-4 py-2 rounded-xl font-bold transition whitespace-nowrap">
          Annulées ({{ getCount('CANCELLED') }})
        </button>
      </div>

      <!-- État de chargement -->
      <div *ngIf="loading" class="py-16 text-center text-gray-400 space-y-3">
        <i class="fa-solid fa-spinner animate-spin text-3xl text-[#F5C518]"></i>
        <p class="text-xs font-bold">Chargement de votre historique depuis la base de données...</p>
      </div>

      <!-- Liste vide -->
      <div *ngIf="!loading && filteredRides.length === 0" class="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm space-y-4">
        <div class="w-16 h-16 mx-auto rounded-full bg-yellow-50 flex items-center justify-center text-[#F5C518] text-2xl shadow-inner">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <h3 class="text-base font-black text-gray-900">Aucune course trouvée</h3>
        <p class="text-xs text-gray-400 max-w-sm mx-auto">
          Vous n'avez pas encore de course enregistrée dans cette catégorie. Commandez dès maintenant votre premier mototaxi !
        </p>
      </div>

      <!-- Liste des courses réelles -->
      <div *ngIf="!loading && filteredRides.length > 0" class="space-y-4">
        <div 
          *ngFor="let ride of filteredRides" 
          class="bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition space-y-4">
          
          <!-- En-tête de la carte -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div class="flex items-center gap-3">
              <!-- Icône du véhicule -->
              <div class="w-11 h-11 rounded-2xl bg-yellow-50 flex items-center justify-center text-base text-[#1A1A1A] shrink-0 border border-yellow-200">
                <i class="fa-solid fa-motorcycle" *ngIf="ride.vehicleType === 'MOTO'"></i>
                <i class="fa-solid fa-taxi" *ngIf="ride.vehicleType === 'TAXI'"></i>
                <i class="fa-solid fa-truck-fast" *ngIf="ride.vehicleType === 'EXPRESS'"></i>
              </div>
              
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-black text-gray-900">Course #{{ ride.id }}</span>
                  <span class="bg-gray-100 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    {{ ride.vehicleType || 'MOTO' }}
                  </span>
                </div>
                <p class="text-[11px] text-gray-400 font-medium">
                  {{ formatDate(ride.requestedAt) }}
                </p>
              </div>
            </div>

            <!-- Prix & Statut -->
            <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1">
              <span class="text-base sm:text-lg font-black text-[#1A1A1A] bg-yellow-50 px-3 py-0.5 rounded-xl border border-yellow-200">
                {{ (ride.finalPrice || ride.estimatedPrice || 0) | number:'1.1-1' }} TND
              </span>
              <span 
                [ngClass]="{
                  'text-emerald-700 bg-emerald-50 border-emerald-200': ride.status === 'COMPLETED',
                  'text-blue-700 bg-blue-50 border-blue-200': ride.status === 'IN_PROGRESS' || ride.status === 'ACCEPTED',
                  'text-yellow-700 bg-yellow-50 border-yellow-200': ride.status === 'PENDING',
                  'text-red-700 bg-red-50 border-red-200': ride.status === 'CANCELLED'
                }"
                class="text-[10px] font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1">
                <i class="fa-solid fa-circle-check text-[9px]" *ngIf="ride.status === 'COMPLETED'"></i>
                <i class="fa-solid fa-spinner animate-spin text-[9px]" *ngIf="ride.status === 'IN_PROGRESS' || ride.status === 'ACCEPTED'"></i>
                <i class="fa-solid fa-xmark text-[9px]" *ngIf="ride.status === 'CANCELLED'"></i>
                <span>{{ getStatusLabel(ride.status) }}</span>
              </span>
            </div>
          </div>

          <!-- Trajet : Départ & Arrivée -->
          <div class="bg-gray-50/70 p-4 rounded-2xl border border-gray-100 space-y-2 text-xs">
            <div class="flex items-start gap-2.5">
              <i class="fa-solid fa-circle text-[9px] text-emerald-500 mt-1 shrink-0"></i>
              <div>
                <span class="text-[10px] font-bold text-gray-400 block uppercase">Départ</span>
                <span class="font-bold text-gray-800">{{ ride.originAddress }}</span>
              </div>
            </div>
            <div class="flex items-start gap-2.5 pt-1 border-t border-gray-200/50">
              <i class="fa-solid fa-location-dot text-xs text-[#F5C518] mt-0.5 shrink-0"></i>
              <div>
                <span class="text-[10px] font-bold text-gray-400 block uppercase">Arrivée</span>
                <span class="font-bold text-gray-900">{{ ride.destAddress }}</span>
              </div>
            </div>
          </div>

          <!-- Détails Chauffeur & Action REÇU -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div class="flex items-center gap-2 text-xs text-gray-600">
              <div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-700 shrink-0">
                <i class="fa-solid fa-user"></i>
              </div>
              <div>
                <span class="font-bold text-gray-900">{{ ride.driverName || 'Chauffeur Partenaire' }}</span>
                <span class="text-gray-400 text-[11px] ml-1.5" *ngIf="ride.driverPlate">
                  • Plaque : <strong class="text-gray-700 font-mono">{{ ride.driverPlate }}</strong>
                </span>
              </div>
            </div>

            <!-- BOUTON VOIR LE REÇU (Pour toutes les courses terminées) -->
            <div *ngIf="ride.status === 'COMPLETED'">
              <button 
                (click)="openReceipt(ride)"
                class="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow-sm transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-receipt text-sm"></i>
                <span>Voir le Reçu Officiel</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- ============================================================ -->
      <!-- MODAL OFFICIEL DU REÇU DE COURSE (Format Reçu & Imprimable)   -->
      <!-- ============================================================ -->
      <div 
        *ngIf="selectedRide" 
        class="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
        
        <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col justify-between animate-scaleUp">
          
          <!-- Reçu Top Header -->
          <div class="bg-[#1A1A1A] text-white p-5 flex items-center justify-between border-b border-white/10">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-[#F5C518] text-[#1A1A1A] flex items-center justify-center text-lg font-black shadow">
                <i class="fa-solid fa-receipt"></i>
              </div>
              <div>
                <span class="text-[10px] font-black uppercase text-[#F5C518] tracking-wider block">Reçu Certifié</span>
                <h3 class="text-base font-black text-white leading-tight">MotoTaxi TN • Facture</h3>
              </div>
            </div>

            <button 
              (click)="closeReceipt()" 
              class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition">
              <i class="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          <!-- Reçu Body (Style Ticket Officiel) -->
          <div class="p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-gray-50/50">
            
            <!-- Badge Statut Payé -->
            <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                  <i class="fa-solid fa-check"></i>
                </div>
                <span class="text-xs font-black text-emerald-800 uppercase">Course Clôturée & Encaissée</span>
              </div>
              <span class="text-[10px] bg-white text-emerald-700 font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                Espèces
              </span>
            </div>

            <!-- Fiche Reçu Structurée -->
            <div class="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-5 space-y-3 font-mono text-xs text-gray-800 shadow-sm">
              <div class="text-center pb-2 border-b border-gray-200">
                <h4 class="font-black text-sm uppercase text-gray-900 tracking-wider">🧾 MOTOTAXI TUNISIE</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">Grand Tunis • Service de Transport Rapide</p>
                <p class="text-[11px] font-bold text-gray-600 mt-1">Course N° #{{ selectedRide.id }}</p>
              </div>

              <!-- Lignes du reçu -->
              <div class="space-y-2 text-[11px] leading-relaxed">
                <div class="flex justify-between items-start">
                  <span class="text-gray-400">Date & Heure :</span>
                  <span class="font-bold text-right text-gray-900">{{ formatDate(selectedRide.requestedAt) }}</span>
                </div>
                <div class="flex justify-between items-start">
                  <span class="text-gray-400">Service :</span>
                  <span class="font-bold text-gray-900 uppercase">{{ selectedRide.vehicleType || 'MOTO' }} MotoTaxi</span>
                </div>
                <div class="flex justify-between items-start">
                  <span class="text-gray-400">Chauffeur :</span>
                  <span class="font-bold text-gray-900">{{ selectedRide.driverName || 'Chauffeur Partenaire' }}</span>
                </div>
                <div class="flex justify-between items-start" *ngIf="selectedRide.driverPlate">
                  <span class="text-gray-400">Immatriculation :</span>
                  <span class="font-bold text-gray-900">{{ selectedRide.driverPlate }}</span>
                </div>
                <div class="flex justify-between items-start">
                  <span class="text-gray-400">Client :</span>
                  <span class="font-bold text-gray-900">{{ clientName }}</span>
                </div>
                
                <div class="pt-2 border-t border-gray-100">
                  <span class="text-gray-400 block text-[10px] uppercase font-bold">📍 Départ :</span>
                  <p class="font-bold text-gray-800 text-[11px]">{{ selectedRide.originAddress }}</p>
                </div>

                <div>
                  <span class="text-gray-400 block text-[10px] uppercase font-bold">🏁 Destination :</span>
                  <p class="font-bold text-gray-900 text-[11px]">{{ selectedRide.destAddress }}</p>
                </div>
              </div>

              <!-- Total Final -->
              <div class="pt-3 border-t-2 border-gray-900 flex justify-between items-center text-sm font-black text-gray-900">
                <span>TOTAL RÉGLÉ :</span>
                <span class="text-base text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  {{ (selectedRide.finalPrice || selectedRide.estimatedPrice || 0) | number:'1.1-1' }} TND
                </span>
              </div>

              <div class="text-center pt-2 text-[10px] text-gray-400 border-t border-gray-100">
                Merci d'avoir fait confiance à MotoTaxi TN !<br>
                Service client : contact&#64;mototaxi.tn
              </div>
            </div>

            <!-- Si un reçu officiel textuel est enregistré dans le chat -->
            <div *ngIf="chatReceiptText" class="p-3 bg-gray-100 rounded-xl text-[10px] font-mono text-gray-600 whitespace-pre-line border border-gray-200">
              {{ chatReceiptText }}
            </div>

          </div>

          <!-- Boutons d'Action (Imprimer & Fermer) -->
          <div class="p-4 bg-white border-t border-gray-100 flex gap-2">
            <button 
              (click)="printReceipt()" 
              class="flex-1 py-3 bg-[#F5C518] hover:bg-[#E5B50A] text-[#1A1A1A] font-black text-xs rounded-2xl shadow-md transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
              <i class="fa-solid fa-print"></i>
              <span>Imprimer / Télécharger</span>
            </button>
            <button 
              (click)="closeReceipt()" 
              class="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-2xl transition cursor-pointer">
              Fermer
            </button>
          </div>

        </div>

      </div>

    </div>
  `
})
export class HistoryComponent implements OnInit {
  rides: RideResponse[] = [];
  filteredRides: RideResponse[] = [];
  loading: boolean = false;
  filterStatus: 'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'CANCELLED' = 'ALL';

  selectedRide: RideResponse | null = null;
  chatReceiptText: string | null = null;
  clientName: string = 'Sami Ben Salah';

  constructor(
    private rideService: RideService,
    private authService: AuthService,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user?.fullName) {
      this.clientName = user.fullName;
    }
    this.loadRides();
  }

  loadRides(): void {
    const user = this.authService.currentUser();
    const customerId = user?.userId || 2;

    this.loading = true;
    this.rideService.getCustomerRides(customerId).subscribe({
      next: (data) => {
        this.loading = false;
        // Trier par date la plus récente en premier
        this.rides = (data || []).sort((a, b) => {
          const dateA = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
          const dateB = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
          return dateB - dateA;
        });
        this.applyFilter();
      },
      error: (err) => {
        console.error('Erreur chargement historique client:', err);
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    if (this.filterStatus === 'ALL') {
      this.filteredRides = [...this.rides];
    } else if (this.filterStatus === 'COMPLETED') {
      this.filteredRides = this.rides.filter(r => r.status === 'COMPLETED');
    } else if (this.filterStatus === 'IN_PROGRESS') {
      this.filteredRides = this.rides.filter(r => r.status === 'IN_PROGRESS' || r.status === 'ACCEPTED');
    } else if (this.filterStatus === 'CANCELLED') {
      this.filteredRides = this.rides.filter(r => r.status === 'CANCELLED');
    }
  }

  getCount(status: string): number {
    return this.rides.filter(r => r.status === status).length;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'Terminée & Réglée';
      case 'IN_PROGRESS': return 'En cours de trajet';
      case 'ACCEPTED': return 'Chauffeur en route';
      case 'PENDING': return 'En attente';
      case 'CANCELLED': return 'Annulée';
      default: return status;
    }
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return 'Date récente';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  openReceipt(ride: RideResponse): void {
    this.selectedRide = ride;
    this.chatReceiptText = null;

    // Charger les messages du chat pour voir si un reçu textuel y est archivé
    this.chatService.getMessages(ride.id).subscribe({
      next: (msgs) => {
        const receiptMsg = msgs.find(m => m.senderRole === 'SYSTEM' || (m.content && m.content.includes('REÇU OFFICIEL')));
        if (receiptMsg) {
          this.chatReceiptText = receiptMsg.content;
        }
      },
      error: () => {}
    });
  }

  closeReceipt(): void {
    this.selectedRide = null;
    this.chatReceiptText = null;
  }

  printReceipt(): void {
    window.print();
  }
}
