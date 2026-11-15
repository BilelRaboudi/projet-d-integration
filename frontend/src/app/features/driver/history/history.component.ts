import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RideService } from '../../../core/services/ride.service';
import { DriverService } from '../../../core/services/driver.service';
import { AuthService } from '../../../core/services/auth.service';
import { RideResponse } from '../../../core/models/ride.model';

@Component({
  selector: 'app-driver-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-4">
      <div class="flex justify-between items-center mb-2">
        <div>
          <h3 class="text-base font-black text-gray-900">Historique de mes courses</h3>
          <p class="text-xs text-gray-400">Toutes vos courses enregistrées dans la base de données</p>
        </div>
        <span class="text-xs font-bold text-gray-400 bg-white border border-gray-200 px-3 py-1 rounded-xl shadow-sm">
          {{ rides.length }} course(s)
        </span>
      </div>

      <div *ngIf="loading" class="py-12 text-center text-xs text-gray-400">
        <i class="fa-solid fa-spinner animate-spin text-lg mr-2 text-[#F5C518]"></i> Chargement de l'historique...
      </div>

      <div *ngIf="!loading && rides.length > 0" class="space-y-3">
        <div *ngFor="let item of rides" class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2 text-xs">
          <div class="flex justify-between items-center">
            <span class="text-gray-400 font-semibold">{{ item.formattedTime }}</span>
            <span class="font-black text-[#1A1A1A] bg-[#F5C518] px-2.5 py-0.5 rounded-lg">
              {{ (item.finalPrice || item.estimatedPrice) | number:'1.1-1' }} TND
            </span>
          </div>

          <div class="font-bold text-gray-900 text-sm flex items-center gap-2">
            <span>{{ item.originAddress }}</span>
            <i class="fa-solid fa-arrow-right text-[11px] text-gray-400"></i>
            <span>{{ item.destAddress }}</span>
          </div>

          <div class="text-[11px] text-gray-500 flex justify-between pt-2 border-t border-gray-50 items-center">
            <span>Client : <strong class="text-gray-700">{{ item.customerName || 'Client' }}</strong></span>
            <span [ngClass]="{
              'text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-bold': item.status === 'COMPLETED',
              'text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-bold': item.status === 'IN_PROGRESS',
              'text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full font-bold': item.status === 'ACCEPTED',
              'text-red-500 bg-red-50 px-2 py-0.5 rounded-full font-bold': item.status === 'CANCELLED'
            }">
              {{ item.status === 'COMPLETED' ? 'Encaissé (Espèces)' : item.status }}
            </span>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && rides.length === 0" class="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 text-center space-y-2 text-xs text-gray-400">
        <i class="fa-regular fa-clock text-3xl text-gray-300 block mb-1"></i>
        Aucune course trouvée dans votre historique.
      </div>
    </div>
  `
})
export class HistoryComponent implements OnInit {
  rides: (RideResponse & { formattedTime: string })[] = [];
  loading = false;
  driverId = 1;

  constructor(
    private rideService: RideService,
    private driverService: DriverService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.initDriverAndLoad();
  }

  initDriverAndLoad(): void {
    this.loading = true;
    const user = this.authService.currentUser();
    if (user?.userId) {
      this.driverService.getDriverByUserId(user.userId).subscribe({
        next: (d) => {
          if (d) {
            this.driverId = d.id;
          }
          this.loadHistory();
        },
        error: () => this.loadHistory()
      });
    } else {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    this.rideService.getDriverRides(this.driverId).subscribe({
      next: (list) => {
        this.loading = false;
        this.rides = (list || []).map(r => ({
          ...r,
          formattedTime: r.requestedAt ? new Date(r.requestedAt).toLocaleString('fr-TN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'Date inconnue'
        })).reverse(); // plus récentes d'abord
      },
      error: (err) => {
        console.error('Erreur historique chauffeur:', err);
        this.loading = false;
      }
    });
  }
}
