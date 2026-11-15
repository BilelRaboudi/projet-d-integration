import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RideService } from '../../../core/services/ride.service';
import { DriverService } from '../../../core/services/driver.service';
import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { RideResponse } from '../../../core/models/ride.model';

@Component({
  selector: 'app-driver-requests',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-4">
      <div class="flex justify-between items-center mb-2">
        <div>
          <h3 class="text-base font-black text-gray-900">Demandes de courses à proximité</h3>
          <p class="text-xs text-gray-400">Demandes réelles en temps réel provenant des clients</p>
        </div>
        <button 
          (click)="loadPendingRides()"
          class="px-3 py-1.5 bg-white border border-gray-200 text-xs font-bold text-gray-700 rounded-xl hover:bg-gray-50 flex items-center gap-1.5 shadow-sm">
          <i class="fa-solid fa-arrows-rotate" [ngClass]="{'animate-spin': loading}"></i>
          <span>Actualiser</span>
        </button>
      </div>

      <div *ngIf="loading" class="py-12 flex justify-center items-center text-xs text-gray-400">
        <i class="fa-solid fa-spinner animate-spin text-lg mr-2 text-[#F5C518]"></i>
        Recherche des courses à proximité...
      </div>

      <div *ngIf="!loading && requests.length > 0" class="space-y-3">
        <div *ngFor="let req of requests" class="bg-white rounded-3xl p-5 shadow-md border-2 border-yellow-300 space-y-3 transition hover:shadow-lg">
          <div class="flex justify-between items-start">
            <div>
              <span class="text-[11px] font-extrabold uppercase text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                ⚡ Course disponible #{{ req.id }}
              </span>
              <h4 class="text-sm font-black text-gray-900 mt-2 flex items-center gap-2">
                <span>{{ req.originAddress }}</span>
                <i class="fa-solid fa-arrow-right text-xs text-gray-400"></i>
                <span>{{ req.destAddress }}</span>
              </h4>
              <p class="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <span><i class="fa-solid fa-user text-gray-400 mr-1"></i>Client : <strong>{{ req.customerName || 'Client' }}</strong></span>
                <span *ngIf="req.customerPhone" class="text-gray-400">({{ req.customerPhone }})</span>
              </p>
            </div>
            <span class="text-xl font-black text-[#1A1A1A] bg-yellow-50 border border-yellow-200 px-3 py-1 rounded-2xl">
              {{ req.estimatedPrice | number:'1.1-1' }} TND
            </span>
          </div>

          <div class="flex gap-2 pt-2 border-t border-gray-100">
            <button 
              (click)="ignoreRide(req.id)"
              class="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition">
              Passer
            </button>
            <button 
              (click)="acceptRide(req.id)"
              [disabled]="isAccepting"
              class="flex-1 py-2 bg-[#F5C518] text-[#1A1A1A] rounded-xl text-xs font-black shadow-md hover:bg-[#E5B50A] transition active:scale-95 flex items-center justify-center gap-1.5">
              <i class="fa-solid fa-check"></i>
              <span>Accepter la course</span>
            </button>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && requests.length === 0" class="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 text-center space-y-3">
        <div class="w-14 h-14 mx-auto rounded-full bg-yellow-50 flex items-center justify-center text-[#F5C518] text-2xl">
          <i class="fa-solid fa-radar animate-pulse"></i>
        </div>
        <h4 class="text-sm font-bold text-gray-800">Aucune demande en attente</h4>
        <p class="text-xs text-gray-400 max-w-sm mx-auto">
          Il n'y a actuellement aucune demande non assignée dans le secteur. Dès qu'un client réserve une course, elle apparaîtra ici instantanément.
        </p>
      </div>
    </div>
  `
})
export class RequestsComponent implements OnInit, OnDestroy {
  requests: RideResponse[] = [];
  loading = false;
  isAccepting = false;
  driverId: number = 1;

  private socketSub: Subscription | null = null;

  constructor(
    private rideService: RideService,
    private driverService: DriverService,
    private authService: AuthService,
    private socketService: SocketService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initDriverAndLoad();
    this.listenToSocket();
  }

  ngOnDestroy(): void {
    if (this.socketSub) {
      this.socketSub.unsubscribe();
    }
  }

  initDriverAndLoad(): void {
    const user = this.authService.currentUser();
    if (user?.userId) {
      this.driverService.getDriverByUserId(user.userId).subscribe({
        next: (d) => {
          if (d) {
            this.driverId = d.id;
          }
          this.loadPendingRides();
        },
        error: () => this.loadPendingRides()
      });
    } else {
      this.loadPendingRides();
    }
  }

  loadPendingRides(): void {
    this.loading = true;
    this.rideService.getPendingRides(this.driverId).subscribe({
      next: (rides) => {
        this.requests = rides || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement demandes en attente:', err);
        this.loading = false;
      }
    });
  }

  listenToSocket(): void {
    this.socketService.connect();
    this.socketSub = this.socketService.listen<any>('ride:incomingRequest').subscribe((req) => {
      if (!this.requests.some(r => r.id === req.id)) {
        this.requests.unshift(req);
      }
    });
  }

  acceptRide(rideId: number): void {
    if (this.isAccepting) return;
    this.isAccepting = true;

    this.rideService.acceptRide(rideId, this.driverId).subscribe({
      next: () => {
        this.isAccepting = false;
        this.socketService.emit('ride:accepted', {
          rideId: rideId,
          driverId: this.driverId
        });
        this.router.navigate(['/driver/dashboard']);
      },
      error: (err) => {
        console.error('Erreur acceptation course:', err);
        this.isAccepting = false;
        this.loadPendingRides();
      }
    });
  }

  ignoreRide(rideId: number): void {
    this.requests = this.requests.filter(r => r.id !== rideId);
  }
}
