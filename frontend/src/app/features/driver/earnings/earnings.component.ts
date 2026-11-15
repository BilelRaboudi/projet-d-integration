import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RideService } from '../../../core/services/ride.service';
import { DriverService } from '../../../core/services/driver.service';
import { AuthService } from '../../../core/services/auth.service';
import { RideResponse } from '../../../core/models/ride.model';

interface DailyEarning {
  label: string;
  amount: number;
  ridesCount: number;
}

@Component({
  selector: 'app-driver-earnings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-4">
      <!-- Total Gains Card -->
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
        <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total des gains cumulés</span>
        <h2 class="text-4xl font-black text-gray-900 mt-1">
          {{ totalEarnings | number:'1.2-2' }} <span class="text-sm font-bold text-gray-500">TND</span>
        </h2>
        <div class="inline-flex items-center gap-1 text-green-600 bg-green-50 px-3 py-1 rounded-full text-xs font-bold mt-2">
          <i class="fa-solid fa-arrow-trend-up"></i>
          <span>{{ completedRidesCount }} course(s) payée(s) enregistrée(s)</span>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="py-8 text-center text-xs text-gray-400">
        <i class="fa-solid fa-spinner animate-spin text-base mr-1"></i> Calcul des gains en cours...
      </div>

      <!-- Detail per day -->
      <div *ngIf="!loading" class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
        <h3 class="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Détail par jour</h3>
        
        <div class="space-y-2 text-xs" *ngIf="dailyBreakdown.length > 0">
          <div 
            *ngFor="let item of dailyBreakdown; let last = last" 
            class="flex justify-between items-center py-2"
            [ngClass]="{'border-b border-gray-100': !last}">
            <span class="font-bold text-gray-700">{{ item.label }}</span>
            <span class="font-black text-gray-900">
              {{ item.amount | number:'1.1-1' }} TND 
              <span class="text-gray-400 font-semibold text-[11px]">({{ item.ridesCount }} courses)</span>
            </span>
          </div>
        </div>

        <div *ngIf="dailyBreakdown.length === 0" class="py-6 text-center text-gray-400 text-xs">
          Aucun historique de gains enregistré pour le moment.
        </div>
      </div>
    </div>
  `
})
export class EarningsComponent implements OnInit {
  totalEarnings = 0.0;
  completedRidesCount = 0;
  dailyBreakdown: DailyEarning[] = [];
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
            this.totalEarnings = d.totalEarnings || 0.0;
          }
          this.loadEarningsHistory();
        },
        error: () => this.loadEarningsHistory()
      });
    } else {
      this.loadEarningsHistory();
    }
  }

  loadEarningsHistory(): void {
    this.rideService.getDriverRides(this.driverId).subscribe({
      next: (rides) => {
        this.loading = false;
        const completed = (rides || []).filter(r => r.status === 'COMPLETED');
        this.completedRidesCount = completed.length;

        // Si le driver a des courses complétées, recalculer la somme exacte
        if (completed.length > 0) {
          const sum = completed.reduce((acc, r) => acc + (r.finalPrice || r.estimatedPrice || 0), 0);
          if (sum > this.totalEarnings) {
            this.totalEarnings = sum;
          }
        }

        // Grouper par date
        const groups = new Map<string, { amount: number; count: number }>();
        const todayStr = new Date().toDateString();

        completed.forEach(r => {
          const date = r.requestedAt ? new Date(r.requestedAt) : new Date();
          const key = date.toDateString();
          const current = groups.get(key) || { amount: 0, count: 0 };
          current.amount += (r.finalPrice || r.estimatedPrice || 0);
          current.count += 1;
          groups.set(key, current);
        });

        this.dailyBreakdown = Array.from(groups.entries()).map(([key, data]) => {
          let label = key;
          const d = new Date(key);
          if (key === todayStr) {
            label = "Aujourd'hui (" + d.toLocaleDateString('fr-TN', { weekday: 'long' }) + ")";
          } else {
            label = d.toLocaleDateString('fr-TN', { weekday: 'long', day: 'numeric', month: 'short' });
          }
          return {
            label: label.charAt(0).toUpperCase() + label.slice(1),
            amount: data.amount,
            ridesCount: data.count
          };
        });
      },
      error: (err) => {
        console.error('Erreur chargement gains:', err);
        this.loading = false;
      }
    });
  }
}
