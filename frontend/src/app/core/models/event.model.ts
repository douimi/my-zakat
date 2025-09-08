export interface Event {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  image?: string;
  created_at: string;
  is_featured: boolean;
  max_attendees?: number;
  registration_deadline?: string;
}

export interface EventsResponse {
  events: Event[];
  total?: number;
  pages?: number;
  current_page?: number;
  count?: number;
}
