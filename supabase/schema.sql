-- 무사어판(코리안에셋) Supabase 스키마
-- Supabase 대시보드 SQL Editor에서 그대로 실행하세요.

-- =========================================
-- 1. profiles (auth.users와 1:1)
-- =========================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique not null,
  points int not null default 0,
  role text not null default 'user' check (role in ('user', 'staff', 'master')),
  blocked text[] not null default '{}',
  last_login_date date,
  created_at timestamptz not null default now()
);

-- 신규 가입 시 profiles 행을 자동 생성 (nickname은 가입 시 metadata로 전달)
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =========================================
-- 2. posts
-- =========================================
create table if not exists posts (
  id bigint generated always as identity primary key,
  category text not null,
  subcategory text,
  title text not null,
  content text not null,
  author_id uuid not null references profiles(id) on delete cascade,
  views int not null default 0,
  likes int not null default 0,
  dislikes int not null default 0,
  liked_by uuid[] not null default '{}',
  disliked_by uuid[] not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);

-- =========================================
-- 3. comments
-- =========================================
create table if not exists comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  likes int not null default 0,
  dislikes int not null default 0,
  liked_by uuid[] not null default '{}',
  disliked_by uuid[] not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);

-- =========================================
-- 4. messages (쪽지)
-- =========================================
create table if not exists messages (
  id bigint generated always as identity primary key,
  from_id uuid not null references profiles(id) on delete cascade,
  to_id uuid not null references profiles(id) on delete cascade,
  subject text not null,
  content text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================
-- 5. notifications
-- =========================================
create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  text text not null,
  read boolean not null default false,
  link jsonb,
  created_at timestamptz not null default now()
);

-- =========================================
-- 6. inquiries (1:1문의)
-- =========================================
create table if not exists inquiries (
  id bigint generated always as identity primary key,
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  content text not null,
  status text not null default '답변대기',
  answer text,
  created_at timestamptz not null default now()
);

-- =========================================
-- Row Level Security
-- =========================================
alter table profiles enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table inquiries enable row level security;

-- 현재 로그인한 사용자가 마스터인지 확인하는 헬퍼
create or replace function is_master()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'master'
  );
$$ language sql security definer stable set search_path = public;

-- profiles: 누구나 읽기(닉네임/등급 표시용), 본인만 수정, 마스터는 전체 수정
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id or is_master());

-- posts: 누구나 읽기(목록/본문 비공개 처리는 앱 레이어에서 처리), 로그인 사용자만 작성
-- 추천/비추천 카운터 갱신을 위해 인증된 사용자는 누구나 update 가능, 삭제는 작성자/마스터만
create policy "posts_select_all" on posts for select using (true);
create policy "posts_insert_own" on posts for insert with check (auth.uid() = author_id);
create policy "posts_update_authenticated" on posts for update using (auth.uid() is not null);
create policy "posts_delete_owner_or_master" on posts for delete using (auth.uid() = author_id or is_master());

-- comments: 동일한 정책
create policy "comments_select_all" on comments for select using (true);
create policy "comments_insert_own" on comments for insert with check (auth.uid() = author_id);
create policy "comments_update_authenticated" on comments for update using (auth.uid() is not null);
create policy "comments_delete_owner_or_master" on comments for delete using (auth.uid() = author_id or is_master());

-- messages: 보낸 사람/받는 사람만 조회, 보낸 사람만 작성, 양쪽 다 삭제 가능
create policy "messages_select_participant" on messages for select using (auth.uid() = from_id or auth.uid() = to_id);
create policy "messages_insert_own" on messages for insert with check (auth.uid() = from_id);
create policy "messages_update_participant" on messages for update using (auth.uid() = from_id or auth.uid() = to_id);
create policy "messages_delete_participant" on messages for delete using (auth.uid() = from_id or auth.uid() = to_id);

-- notifications: 본인 알림만 조회/수정, 인증된 사용자는 다른 사용자에게 알림 생성 가능(댓글/추천 알림 등)
create policy "notifications_select_own" on notifications for select using (auth.uid() = user_id);
create policy "notifications_insert_authenticated" on notifications for insert with check (auth.uid() is not null);
create policy "notifications_update_own" on notifications for update using (auth.uid() = user_id);

-- inquiries: 본인 문의만 조회/작성, 마스터는 전체 조회 및 답변(수정) 가능
create policy "inquiries_select_own_or_master" on inquiries for select using (auth.uid() = author_id or is_master());
create policy "inquiries_insert_own" on inquiries for insert with check (auth.uid() = author_id);
create policy "inquiries_update_master" on inquiries for update using (is_master());

-- =========================================
-- 회원 탈퇴: auth.users 삭제 시 profiles 및 그 하위(posts/comments/messages/notifications/inquiries)가 cascade로 함께 삭제됨
-- =========================================
create or replace function public.delete_user()
returns void as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public, auth;

grant execute on function public.delete_user() to authenticated;
