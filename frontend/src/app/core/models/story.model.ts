export interface Story {
  id: number;
  title: string;
  summary: string;
  content: string;
  image_filename?: string;
  video_url?: string;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  view_count: number;
  category?: string;
}

export interface StoriesResponse {
  stories: Story[];
  total: number;
  pages: number;
  current_page: number;
}
