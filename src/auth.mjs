import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
export async function createAuth(config) {
  if (!/^[0-9a-f-]{36}$/i.test(config.clientId || '')) return null;
  const msal = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: new URL('./redirect.html', location.href).href,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await msal.initialize();
  const account = () => msal.getActiveAccount() || msal.getAllAccounts()[0];
  return {
    account,
    async login() {
      const result = await msal.loginPopup({ scopes: config.scopes, prompt: 'select_account' });
      msal.setActiveAccount(result.account);
      return result.account;
    },
    async getToken() {
      if (!account()) throw Error('Conectá tu cuenta Microsoft antes de guardar.');
      try {
        return (await msal.acquireTokenSilent({ scopes: config.scopes, account: account() }))
          .accessToken;
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError)
          throw Error(
            'Microsoft requiere verificar tu sesión. Pulsá Conectar Microsoft y volvé a intentar.',
          );
        throw Error('No se pudo obtener acceso a SharePoint. Volvé a conectar Microsoft.');
      }
    },
  };
}
