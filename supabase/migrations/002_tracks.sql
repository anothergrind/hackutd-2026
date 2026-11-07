create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  sponsor text not null,
  title text not null,
  prizes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tracks enable row level security;

create policy "Tracks are publicly readable"
  on public.tracks for select
  using (true);

insert into public.tracks (sponsor, title, prizes)
values
  ('T-Mobile', 'Safe Signal', '[{"place":"1st","prize":"Apple Mac Mini"},{"place":"2nd","prize":"NVIDIA Jetson Orin Nano Super"},{"place":"3rd","prize":"Plaud NotePin S"}]'),
  ('PNC Bank', '360° Financial Health Navigator', '[{"place":"1st","prize":"PlayStation 5 Slim"},{"place":"2nd","prize":"Ninja Creami"},{"place":"3rd","prize":"Apple AirPods Pro 3"}]'),
  ('8090 Solutions', 'Legacy System Modernization', '[{"place":"1st","prize":"Mic Mini Wireless Mics"},{"place":"2nd","prize":"Mic Mini Wireless Mics"},{"place":"3rd","prize":"Mic Mini Wireless Mics"}]'),
  ('Northmark Compute & Cloud', 'Keep the World Running', '[{"place":"1st","prize":"AirPods Max Gen 2"},{"place":"2nd","prize":"Apple Watch Series 12"},{"place":"3rd","prize":"Echo Show 11"}]'),
  ('Toyota Financial Services', 'The Smartest Next Move', '[{"place":"1st","prize":"$500 Amazon gift card per team"},{"place":"2nd","prize":"$350 Amazon gift card per team"},{"place":"3rd","prize":"$150 Amazon gift card per team"}]'),
  ('Winstead PC', 'Cyber Incident Response Dashboard', '[{"place":"1st","prize":"$1500 per team"},{"place":"2nd","prize":"$900 per team"},{"place":"3rd","prize":"$300 per team"}]'),
  ('EOG Resources', 'HackUTD: ZeroDay. The city of Avon needs you.', '[{"place":"1st","prize":"Bambu Lab P1S 3D Printer"},{"place":"2nd","prize":"Ninja CREAMi"}]'),
  ('Goldman Sachs', 'DealPilot', '[{"place":"1st","prize":"Apple AirPods Max 2"},{"place":"2nd","prize":"Apple HomePod Mini 2"},{"place":"3rd","prize":"$50 Grubhub Gift Card"}]'),
  ('StateFarm', 'The Worst Day, at Scale – Intelligent Catastrophe Response', '[{"place":"1st","prize":"Beats Studio Pro"},{"place":"2nd","prize":"RC Drone with UHD Camera and GPS"},{"place":"3rd","prize":"Wireless Portable Monitor"}]'),
  ('CBRE', 'Predict Before It Spreads', '[{"place":"1st","prize":"Sony WH-1000XM5 Wireless Noise Cancelling Headphones"},{"place":"2nd","prize":"Kindle (latest model!)"},{"place":"3rd","prize":"Klik Retro Digital Camera"}]'),
  ('Nvidia', 'Use Nemotron Beyond a Chatbot', '[{"place":"1st","prize":"2 RTX 5080 GPUs, $200 Brev Credits (per team)"},{"place":"2nd","prize":"1 RTX 5080 GPU, $200 Brev Credits (per team)"}]'),
  ('Capital One', 'Best Use of Nessie', '[{"place":"1st","prize":"$300 Giftogram for each member of the winning team"}]'),
  ('Spacetime', 'Build on Spacetime', '[{"place":"1st","prize":"$2,048 per team"},{"place":"2nd","prize":"$1,024 per team"},{"place":"3rd","prize":"$512 per team"},{"place":"ScrabbleBot 1st","prize":"$1,024"},{"place":"ScrabbleBot 2nd","prize":"$512"},{"place":"ScrabbleBot 3rd","prize":"$256"}]'),
  ('Photon', 'Best Use of Photon API', '[{"place":"1st","prize":"$400 cash + $300 in API credits + interview fast-track (per team)"},{"place":"2nd","prize":"$200 cash + $100 in credits (per team)"},{"place":"Voice Call Winner","prize":"$300 cash + $100 in credits (per team)"}]')
on conflict do nothing;
