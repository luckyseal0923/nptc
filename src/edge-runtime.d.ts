declare module 'npm:@supabase/supabase-js@2.115.0' {
  export const createClient: typeof import('@supabase/supabase-js').createClient;
}
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
