import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (handler: unknown) => handler };
  return builder;
} }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc, from: () => ({ delete: () => ({ eq: mocks.remove }) }) } }));
import { requestEmailChange, confirmEmailChange } from '@/lib/auth.functions';

// Test real handler decisions, not the transport/middleware (which are supplied by Cloud).
const request = requestEmailChange as unknown as (args: unknown) => Promise<unknown>;
const confirm = confirmEmailChange as unknown as (args: unknown) => Promise<unknown>;
const context = { userId: 'owner', supabase: { auth: mocks } };
const args = { context, data: { email: 'new@example.com', code: '123456' } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner', email: 'old@example.com' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: 'ready', error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
});
describe('email change safeguards', () => {
  it('does not send a code to an address registered to another account', async () => {
    mocks.rpc.mockResolvedValue({ data: 'unavailable', error: null });
    await expect(request(args)).rejects.toThrow('An account is already associated with this email address. Please use a different email.');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('does not resend during the 60-second backend cooldown', async () => {
    mocks.rpc.mockResolvedValue({ data: 'cooldown', error: null });
    await expect(request(args)).rejects.toThrow('60 seconds');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('sends available addresses through Auth verification, not an admin email overwrite', async () => {
    await expect(request(args)).resolves.toEqual({ email: 'new@example.com' });
    expect(mocks.updateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });
  it('does not verify requests whose attempt budget is exhausted', async () => {
    mocks.rpc.mockResolvedValue({ data: 'limited', error: null });
    await expect(confirm(args)).rejects.toThrow('Too many attempts');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it('does not verify an expired request', async () => {
    mocks.rpc.mockResolvedValue({ data: 'expired', error: null });
    await expect(confirm(args)).rejects.toThrow('expired');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it('rejects an invalid or expired code without reporting completion', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired' } });
    await expect(confirm(args)).rejects.toThrow('invalid or expired');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rechecks uniqueness before verifying a code', async () => {
    mocks.rpc.mockResolvedValue({ data: 'unavailable', error: null });
    await expect(confirm(args)).rejects.toThrow('already associated');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it('does not claim success when the provider still requires old-address confirmation', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
    await expect(confirm(args)).resolves.toEqual({ complete: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('reports success only when Auth reads back the verified new email', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: 'owner' }, session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner', email: 'new@example.com' } }, error: null });
    await expect(confirm(args)).resolves.toEqual({ complete: true, email: 'new@example.com', session: { access_token: 'test-access', refresh_token: 'test-refresh' } });
    expect(mocks.remove).toHaveBeenCalledWith('user_id', 'owner');
  });
});