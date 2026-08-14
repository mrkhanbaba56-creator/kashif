# Free signup setup

This project uses the Supabase free tier for email/password accounts and team data. No service-role key is used in the browser.

1. Create a free Supabase project.
2. Open **SQL Editor**, paste all of `schema.sql`, and click **Run**.
3. Open **Project Settings → API** and copy:
   - Project URL
   - `anon` / publishable key
4. Put those two public values in the root `config.js` file.
5. Deploy the site and create your own account through **Free sign up**.
6. Return to SQL Editor and run this once with your own email:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

7. Log out and log in again. **Team & Agents** will now show the owner controls.

## How roles work

- Every new signup starts as **Seller**.
- The Admin can change any registered Seller into an **Agent**.
- The Admin assigns a Seller to an Agent.
- Seller work requests automatically go to the assigned Agent.
- Agents can update their assigned task status.
- Only the Admin can change roles and assignments.

## Recommended Auth settings

In **Authentication → URL Configuration**, add your GitHub Pages URL as the Site URL and Redirect URL. For instant signup you may disable email confirmation; keeping confirmation enabled is safer and the app supports that flow too.

Never put the Supabase `service_role` key in this repository. The browser must use only the public `anon` / publishable key.
