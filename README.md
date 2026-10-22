ClosetMuse

Your wardrobe, reimagined.

ClosetMuse is an AI-powered digital wardrobe and styling platform that helps you organise the clothes you own, discover new outfit combinations, and share selected pieces with people you trust.

We often own more clothes than we realise, yet struggle to visualise our entire wardrobe, rediscover forgotten pieces, or decide what to wear. ClosetMuse brings your wardrobe into one digital space, making it easier to explore your collection, plan outfits, and make more intentional use of what you already own.

Live Demo: https://closetmuse-six.vercel.app
GitHub Repository: https://github.com/laharisrgupta06/closetmuse

Key Features

AI-Powered Wardrobe

* Upload individual clothing items or multiple images in one go.
* Use Gemini-powered image analysis to identify and categorise garments.
* Organise items using attributes such as category, colour, material, occasion, and style.
* Remove image backgrounds directly in the browser.
* Review and edit item details to keep your digital wardrobe accurate.

Smart Wardrobe Organisation

* Browse and filter items by category, item type, aesthetic, design tradition, and occasion.
* Search and sort your collection to find specific pieces.
* Explore traditional, Western, and Indo-Western fashion.
* Keep wardrobe items organised without duplicating items across clothing groups.

Outfit Builder and Saved Outfits

* Combine items from your own wardrobe to create outfits.
* Build looks using category-based slots.
* Save outfits for future reference.

Personalised AI Stylist

* Generate outfit recommendations using items from your own wardrobe.
* Explore styling alternatives without relying on generic clothing suggestions.
* Use your existing collection as the foundation for outfit discovery.

Private Wardrobe-Sharing Rooms

* Create private Rooms and invite people using an invitation code.
* Share selected wardrobe items while keeping the rest of your collection private.
* Browse items that other Room members have chosen to share.
* Request to borrow shared items.
* Let owners accept or decline borrowing requests, with an optional reply.

Notifications

* Stay informed about borrowing requests and their status.
* Receive updates related to Room invitations and activity.

How It Works

1. Build your wardrobe: Upload clothing photos and let AI help identify and organise your items.
2. Explore your collection: Search, filter, and rediscover pieces you already own.
3. Create outfits: Combine items manually or request personalised styling suggestions.
4. Save your looks: Keep outfits for future inspiration.
5. Connect through Rooms: Share selected pieces with trusted people and request to borrow items.

Technology Stack

Technology	Purpose
React 19	User interface
TypeScript	Type-safe application development
Vite	Development server and production build
Tailwind CSS	Interface styling
Supabase Auth	Authentication and session management
Supabase PostgreSQL	Wardrobe data and application records
Supabase Row Level Security	Database access control
Supabase Storage	Image storage
Supabase Edge Functions	Server-side application logic
Gemini API	AI-powered garment analysis and styling
@imgly/background-removal	In-browser image background removal

Architecture

The project separates the frontend, database, image storage, and server-side AI operations.

React + TypeScript Frontend
          |
          v
     Supabase Auth
          |
          v
 Supabase PostgreSQL
  + Row Level Security
          |
          +---- Supabase Storage
          |
          +---- Supabase Edge Functions
                         |
                         +---- Gemini API

Key project directories:

src/
  Application pages, components, and services
supabase/
  functions/
    analyze-garment/
    ai-stylist/
    _shared/
  migrations/
  checks/
tests/
  Automated tests

The Gemini API key is configured on the server side rather than exposed in the browser. Supabase authentication and database policies help control access to protected application data.

Getting Started

Prerequisites

* Node.js and npm
* A Supabase project
* A Gemini API key for the AI-powered features

1. Clone the Repository

git clone https://github.com/laharisrgupta06/closetmuse.git
cd closetmuse

2. Install Dependencies

npm install

3. Configure Environment Variables

Create a .env.local file in the project root:

VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>

Use your own Supabase project credentials. Never commit private keys, service-role keys, or API secrets to the repository.

The Gemini API key should be configured for the Supabase Edge Functions rather than included in frontend environment variables.

4. Configure Supabase

Review the SQL migrations and verification scripts in supabase/ before applying database changes.

Apply the migrations required by the current application schema in the intended order. Use the project’s existing migration history as the source of truth rather than blindly rerunning migrations against a database that is already configured.

Configure the required Supabase Storage bucket, authentication providers, and permitted redirect URLs for your environment.

5. Configure the AI Features

Install and configure the Supabase CLI if needed, then authenticate and link your project:

supabase login
supabase link --project-ref <project-ref>

Configure your Gemini API key as a Supabase secret:

supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>

Deploy the required Edge Functions according to the current project configuration:

supabase functions deploy analyze-garment
supabase functions deploy ai-stylist

6. Start the Development Server

npm run dev

Vite will provide a local URL for opening the application in your browser.

Development Commands

Command	Description
npm run dev	Start the development server
npm run build	Type-check and build the application
npm run lint	Run the configured linter
npm test	Run the project’s Node-based tests
deno test supabase/functions/	Run Edge Function tests when Deno is installed and configured

Design and Data Model

ClosetMuse organises wardrobe items using multiple independent attributes, including:

* Category: The primary wardrobe group, such as tops, bottoms, dresses, footwear, bags, jewellery, and accessories.
* Subcategory: A more specific item type, such as sarees, jhumkas, juttis, or potli bags.
* Style branch: Traditional, Western, or Indo-Western.
* Design tradition: Additional design information, particularly for jewellery.

The shared taxonomy is maintained in supabase/functions/_shared/taxonomy.ts.

This structure supports more flexible browsing while allowing outfit creation and styling features to work with a consistent wardrobe model.

Current Status

ClosetMuse is an actively developed project with a live deployment. Its current capabilities include wardrobe management, AI-assisted item analysis, outfit creation, personalised styling, private wardrobe sharing, borrowing requests, and notifications.

AI-generated results and image background removal can vary depending on the input image and service availability. The project continues to evolve as these workflows are refined.

Future Scope

Potential areas for further development include:

* Virtual outfit composition and dress-up experiences.
* Improved background removal for difficult images, including thin straps and handles.
* Expanded styling preferences and occasion-specific recommendations.
* Further improvements to image storage efficiency and wardrobe management.

These are future improvements, not claims about currently implemented functionality.