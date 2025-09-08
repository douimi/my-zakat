import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T>(endpoint: string, params?: any): Observable<T> {
    const httpParams = this.buildParams(params);
    const headers = this.getHeaders();
    return this.http.get<T>(`${this.apiUrl}${endpoint}`, { params: httpParams, headers });
  }

  post<T>(endpoint: string, body: any): Observable<T> {
    const headers = this.getHeaders();
    return this.http.post<T>(`${this.apiUrl}${endpoint}`, body, { headers });
  }

  put<T>(endpoint: string, body: any): Observable<T> {
    const headers = this.getHeaders();
    return this.http.put<T>(`${this.apiUrl}${endpoint}`, body, { headers });
  }

  delete<T>(endpoint: string): Observable<T> {
    const headers = this.getHeaders();
    return this.http.delete<T>(`${this.apiUrl}${endpoint}`, { headers });
  }

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    
    // Add Authorization header if token exists
    const token = localStorage.getItem('admin_token');
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    
    return headers;
  }

  private buildParams(params: any): HttpParams {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          httpParams = httpParams.set(key, params[key].toString());
        }
      });
    }
    return httpParams;
  }
}
