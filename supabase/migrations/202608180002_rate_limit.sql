-- Limite de tentativas PERSISTIDO.
--
-- POR QUE
--
-- O limite vivia num `Map` em memória dentro da função serverless. Isso não
-- protege quase nada:
--
--   * a memória zera a cada cold start, e funções serverless reciclam o tempo
--     todo. Quem tenta senha em massa só precisa esperar (ou provocar) uma
--     troca de instância;
--   * instâncias concorrentes NÃO compartilham o mapa. Com 10 instâncias
--     ativas, o limite efetivo é 10 vezes o configurado;
--   * o mapa cresce sem poda entre reciclagens.
--
-- Agora a contagem fica no banco, atômica, compartilhada por todas as
-- instâncias e com janela deslizante.
--
-- PRIVACIDADE
--
-- A identidade NÃO é gravada em claro. O endereço IP é dado pessoal (LGPD,
-- art. 5º, I) e não precisa ser legível para contar tentativas: a função recebe
-- um hash HMAC calculado no servidor da aplicação. A tabela serve para contar,
-- não para identificar quem tentou.

create table if not exists public.cofre_rate_limit (
  bucket text not null check (char_length(bucket) between 1 and 40),
  identity_hash text not null check (identity_hash ~ '^[0-9a-f]{64}$'),
  hits integer not null default 0 check (hits >= 0),
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket, identity_hash)
);

create index if not exists cofre_rate_limit_cleanup
  on public.cofre_rate_limit (updated_at);

alter table public.cofre_rate_limit enable row level security;

-- Ninguém lê nem escreve pela API pública. Só a função abaixo, que roda com
-- service_role. Uma tabela de contagem legível seria um oráculo: dá para
-- descobrir se um email existe medindo o consumo do bucket.
revoke all on public.cofre_rate_limit from anon, authenticated;

drop function if exists public.cofre_rate_hit(text, text, integer, integer);
create function public.cofre_rate_hit(
  p_bucket text,
  p_identity_hash text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.cofre_rate_limit%rowtype;
  v_window interval := make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
  v_limit integer := greatest(coalesce(p_limit, 30), 1);
begin
  if p_identity_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid identity' using errcode = '22023';
  end if;

  insert into public.cofre_rate_limit(bucket, identity_hash, hits, window_start, updated_at)
  values (p_bucket, p_identity_hash, 0, now(), now())
  on conflict (bucket, identity_hash) do nothing;

  -- `for update` serializa as tentativas concorrentes da MESMA identidade, que
  -- é justamente o caso de um ataque paralelo.
  select * into v_row from public.cofre_rate_limit
    where bucket = p_bucket and identity_hash = p_identity_hash for update;

  -- Janela expirada: recomeça a contagem.
  if v_row.window_start < now() - v_window then
    update public.cofre_rate_limit
      set hits = 1, window_start = now(), updated_at = now()
      where bucket = p_bucket and identity_hash = p_identity_hash;
    return query select true, 1, 0;
    return;
  end if;

  if v_row.hits >= v_limit then
    update public.cofre_rate_limit set updated_at = now()
      where bucket = p_bucket and identity_hash = p_identity_hash;
    return query select
      false,
      v_row.hits,
      greatest(1, ceil(extract(epoch from (v_row.window_start + v_window - now())))::integer);
    return;
  end if;

  update public.cofre_rate_limit
    set hits = v_row.hits + 1, updated_at = now()
    where bucket = p_bucket and identity_hash = p_identity_hash;

  -- Poda oportunista: linhas paradas há mais de um dia não servem para nada.
  delete from public.cofre_rate_limit where updated_at < now() - interval '1 day';

  return query select true, v_row.hits + 1, 0;
end;
$$;

revoke all on function public.cofre_rate_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.cofre_rate_hit(text, text, integer, integer) to service_role;
