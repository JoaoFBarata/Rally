<script lang="ts">
	import { Building2, Calendar, Cog, Compass, House, Send, ShieldUser, Search, User, Plus } from '@lucide/svelte';

	let { name } = $props<{ name: string; class?: string }>();
</script>

{#if name === 'explore'}
	<Compass/>
{:else if name === 'discover'}
	<Search/>
{:else if name === 'create'}
	<Plus />
{:else if name === 'organization'}
	<Building2/>
{:else if name === 'messages'}
	<Send/>
{:else if name === 'myevents'}
	<Calendar/>
{:else if name === 'dashboard'}
	<House/>
{:else if name === 'profile'}
	<User/>
{:else if name === 'admin'}
	<ShieldUser/>
{:else if name === 'settings'}
	<Cog/>
{/if}