import { Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'stories',
    loadComponent: () => import('./stories/stories-management.component').then(m => m.StoriesManagementComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'events',
    loadComponent: () => import('./events/events-management.component').then(m => m.EventsManagementComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'testimonials',
    loadComponent: () => import('./testimonials/testimonials-management.component').then(m => m.TestimonialsManagementComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'media',
    loadComponent: () => import('./media/media-management.component').then(m => m.MediaManagementComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'volunteers',
    loadComponent: () => import('./volunteers/volunteers-management.component').then(m => m.VolunteersManagementComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'contacts',
    loadComponent: () => import('./contacts/contacts-management.component').then(m => m.ContactsManagementComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'donations',
    loadComponent: () => import('./donations/donations-management.component').then(m => m.DonationsManagementComponent),
    canActivate: [AuthGuard]
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
