import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'donate',
    loadComponent: () => import('./features/donate/donate.component').then(m => m.DonateComponent)
  },
  {
    path: 'stories',
    loadComponent: () => import('./features/stories/stories-list/stories-list.component').then(m => m.StoriesListComponent)
  },
  {
    path: 'stories/:id',
    loadComponent: () => import('./features/stories/story-detail/story-detail.component').then(m => m.StoryDetailComponent)
  },
  {
    path: 'events',
    loadComponent: () => import('./features/events/events-list/events-list.component').then(m => m.EventsListComponent)
  },
  {
    path: 'events/:id',
    loadComponent: () => import('./features/events/event-detail/event-detail.component').then(m => m.EventDetailComponent)
  },
  {
    path: 'volunteer',
    loadComponent: () => import('./features/volunteer/volunteer.component').then(m => m.VolunteerComponent)
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.component').then(m => m.AboutComponent)
  },
  {
    path: 'contact',
    loadComponent: () => import('./features/contact/contact.component').then(m => m.ContactComponent)
  },
  {
    path: 'testimonials',
    loadComponent: () => import('./features/testimonials/testimonials.component').then(m => m.TestimonialsComponent)
  },
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
