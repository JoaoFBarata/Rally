<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/firebase';
  import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  let user = $state<User | null>(null);
  let loading = $state(true);

  onMount(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        await goto(resolve('/login'));
        return;
      }

      user = currentUser;
      loading = false;
    });

    return unsubscribe;
  });

  async function handleLogout() {
    await signOut(auth);
    await goto(resolve('/login'));
  }
</script>

{#if loading}
  <p>A carregar...</p>
{:else}
  <h1>Dashboard</h1>

  <p>Bem-vindo, {user?.displayName ?? user?.email}</p>

  <button onclick={handleLogout}>
    Sair
  </button>
{/if}