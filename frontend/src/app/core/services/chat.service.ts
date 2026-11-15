import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatMessage {
  id?: number;
  rideId: number;
  senderId: number;
  senderName: string;
  senderRole: string; // 'CUSTOMER' ou 'DRIVER'
  content: string;
  timestamp?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = `${environment.apiUrl}/rides`;

  constructor(private http: HttpClient) {}

  /**
   * Charger les messages d'une course
   */
  getMessages(rideId: number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/${rideId}/messages`);
  }

  /**
   * Envoyer un message texte
   */
  sendMessage(rideId: number, content: string, senderName: string, senderRole: string, senderId: number): Observable<ChatMessage> {
    const payload = {
      content,
      senderName,
      senderRole,
      senderId
    };
    return this.http.post<ChatMessage>(`${this.apiUrl}/${rideId}/messages`, payload);
  }
}
