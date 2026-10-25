// Runs every hour on Netlify: releases expired holds, cancels missed appointments, sends next-day reminders.
import { getApp } from '../lib/deps.mjs';

export default async () => {
  const result = await getApp().maintenance();
  console.log('maintenance', JSON.stringify(result));
};

export const config = { schedule: '@hourly' };
