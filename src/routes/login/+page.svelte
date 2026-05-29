<script lang="ts">
  import { auth } from '$lib/firebase';
  import { signInWithEmailAndPassword } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin(event: SubmitEvent) {
    event.preventDefault();

    error = '';
    loading = true;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      await goto(resolve('/dashboard'));
    } catch (err) {
      error = 'Email ou password inválidos.';
      console.error(err);
    } finally {
      loading = false;
    }
  }
</script>

<h1>Login</h1>

<form onsubmit={handleLogin}>
  <label>
    Email
    <input bind:value={email} type="email" required />
  </label>

  <label>
    Password
    <input bind:value={password} type="password" required />
  </label>

  {#if error}
    <p>{error}</p>
  {/if}

  <button type="submit" disabled={loading}>
    {loading ? 'A entrar...' : 'Entrar'}
  </button>
</form>