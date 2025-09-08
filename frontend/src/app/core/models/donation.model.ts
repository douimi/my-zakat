export interface Donation {
  id?: number;
  name: string;
  email: string;
  amount: number;
  frequency: 'one-time' | 'monthly' | 'yearly' | 'Ramadan';
  donated_at?: string;
  status?: string;
  stripe_payment_id?: string;
}

export interface DonationStats {
  total: {
    amount: number;
    count: number;
  };
  monthly: {
    amount: number;
    count: number;
  };
  frequency_breakdown: {
    [key: string]: {
      count: number;
      amount: number;
    };
  };
  recent_donations: Donation[];
}
