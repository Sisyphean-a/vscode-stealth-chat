<script lang="ts">
  export let url = '';
  export let left = 0;
  export let top = 0;
</script>

{#if url}
  <div class="hover-image-preview" style={`left:${left}px; top:${top}px;`} aria-hidden="true">
    <img src={url} alt="Preview" />
  </div>
{/if}
