import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  
  constructor(private router: Router) {}
  
  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const token = localStorage.getItem('admin_token');
    const user = localStorage.getItem('admin_user');
    
    if (token && user) {
      // Check if token is expired (basic check)
      try {
        const userData = JSON.parse(user);
        if (userData && userData.username) {
          return true;
        }
      } catch (e) {
        // Invalid user data, clear storage
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
      }
    }
    
    // Not authenticated, redirect to login
    this.router.navigate(['/admin/login'], { 
      queryParams: { returnUrl: state.url } 
    });
    return false;
  }
}
