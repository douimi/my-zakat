export interface Testimonial {
  id: number;
  name: string;
  country?: string;
  image?: string;
  text: string;
  rating?: number;
  video_url?: string;
  category?: string;
  created_at: string;
  is_approved: boolean;
}

export interface TestimonialsResponse {
  testimonials: Testimonial[];
  total?: number;
  pages?: number;
  current_page?: number;
  count?: number;
}
