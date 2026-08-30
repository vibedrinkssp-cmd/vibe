import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
}

async function listAllFiles(supabase: any, bucket: string, folder: string = ''): Promise<any[]> {
  const allFiles: any[] = []
  
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })

  if (error) throw error
  if (!data) return []

  for (const item of data) {
    const path = folder ? `${folder}/${item.name}` : item.name
    if (item.id === null || item.metadata === null) {
      // It's a folder, recurse
      const subFiles = await listAllFiles(supabase, bucket, path)
      allFiles.push(...subFiles)
    } else {
      allFiles.push({
        path,
        size: item.metadata?.size || 0,
        mimetype: item.metadata?.mimetype || 'application/octet-stream',
        created_at: item.created_at,
      })
    }
  }

  return allFiles
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const adminKey = req.headers.get('x-admin-key')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!adminKey || adminKey !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey!,
      { auth: { persistSession: false } }
    )

    const url = new URL(req.url)
    const bucket = url.searchParams.get('bucket') || 'images'
    const action = url.searchParams.get('action') || 'list'

    if (action === 'list') {
      const files = await listAllFiles(supabase, bucket)
      
      // Generate signed URLs for each file
      const filesWithUrls = []
      for (const file of files) {
        const { data: urlData } = await supabase.storage
          .from(bucket)
          .createSignedUrl(file.path, 3600) // 1 hour expiry

        filesWithUrls.push({
          ...file,
          signedUrl: urlData?.signedUrl || null,
        })
      }

      return new Response(JSON.stringify({ files: filesWithUrls, bucket, total: filesWithUrls.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
