<script lang="ts">
  import { auth, db } from '$lib/firebase';
  import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
  import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleRegister(event: SubmitEvent) {
    event.preventDefault();

    error = '';
    loading = true;

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      await updateProfile(result.user, {
        displayName: name
      });

      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        name,
        email,
        role: 'user',
        createdAt: serverTimestamp()
      });

      await goto(resolve('/dashboard'));
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      const code = errorObj.code;
      console.error('Erro detalhado:', code, errorObj.message);
      
      if (code === 'auth/email-already-in-use') {
        error = 'Este e-mail já está registado.';
      } else if (code === 'auth/invalid-email') {
        error = 'O e-mail introduzido não é válido.';
      } else if (code === 'auth/weak-password') {
        error = 'A password deve ter pelo menos 6 caracteres.';
      } else {
        error = 'Erro ao criar conta: ' + (errorObj.message || 'Ocorreu um erro inesperado.');
      }
    } finally {
      loading = false;
    }
  }
</script>

<h1>Criar conta</h1>

<form onsubmit={handleRegister}>
  <label>
    Nome
    <input bind:value={name} type="text" required />
  </label>

  <label>
    Email
    <input bind:value={email} type="email" required />
  </label>

  <label>
    Password
    <input bind:value={password} type="password" required minlength="6" />
  </label>

  {#if error}
    <p>{error}</p>
  {/if}

  <button type="submit" disabled={loading}>
    {loading ? 'A criar conta...' : 'Criar conta'}
  </button>
</form>