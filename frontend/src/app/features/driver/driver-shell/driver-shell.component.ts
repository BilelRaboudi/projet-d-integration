import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DriverService } from '../../../core/services/driver.service';
import { Driver } from '../../../core/models/driver.model';

@Component({
  selector: 'app-driver-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './driver-shell.component.html',
  styleUrls: ['./driver-shell.component.scss']
})
export class DriverShellComponent implements OnInit {
  driver: Driver | null = null;
  isToggling = false;

  constructor(
    public authService: AuthService,
    private driverService: DriverService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDriverProfile();
  }

  loadDriverProfile(): void {
    const user = this.authService.currentUser();
    if (user?.userId) {
      this.driverService.getDriverByUserId(user.userId).subscribe({
        next: (d) => {
          this.driver = d;
        },
        error: (err) => {
          console.error('Erreur chargement profil chauffeur:', err);
        }
      });
    }
  }

  toggleAvailability(): void {
    if (!this.driver || this.isToggling) return;

    this.isToggling = true;
    const newStatus = !this.driver.available;

    this.driverService.setAvailability(this.driver.id, newStatus).subscribe({
      next: (updated) => {
        if (this.driver) {
          this.driver.available = updated.available;
        }
        this.isToggling = false;
      },
      error: () => {
        this.isToggling = false;
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
