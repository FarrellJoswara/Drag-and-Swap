# One-time setup: Trade on my behalf (Privy server signer)

## Done for you

- **Keypair** generated (`public.pem`, `.privy-auth-key.base64`).
- **Vercel env** (production + preview): `PRIVY_APP_ID`, `PRIVY_AUTH_PRIVATE_KEY` are set.

## One step left (you do this)

You need the **Privy app secret** so we can register the key quorum and set the quorum ID.

1. **Get the app secret**  
   [Privy Dashboard](https://dashboard.privy.io) → your app → **App secret** (copy it).

2. **Add it locally**  
   In **`.env.local`** add one line (paste your real secret):
   ```env
   PRIVY_APP_SECRET=<paste-app-secret-here>
   ```

3. **Register the key quorum and get the quorum ID**  
   In the repo root run:
   ```bash
   npm run setup:privy-quorum
   ```
   This calls the Privy API to register `public.pem` as a key quorum and appends **`VITE_PRIVY_KEY_QUORUM_ID`** to `.env.local`.

4. **Add the app secret to Vercel** (so the serverless swap API can use it)  
   Run (paste the secret when prompted):
   ```bash
   vercel env add PRIVY_APP_SECRET production --sensitive
   vercel env add PRIVY_APP_SECRET preview --sensitive
   ```

5. **Redeploy**  
   So the new env vars are used: Vercel → your project → Deployments → ⋯ on latest → **Redeploy**.

---

## In the app

- Users click **“Allow app to trade on my behalf”** (or run that block once).
- Use the **“Trade on my behalf”** block with **“No approval popup (server signs)”** on so swaps run on the server without a wallet popup.

---

To regenerate keys later: run `npm run setup:privy-key`, then re-run step 3 and update Vercel `PRIVY_AUTH_PRIVATE_KEY` with the new `.privy-auth-key.base64` contents.
