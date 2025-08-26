# 🍽️ Resource Map & Restaurant Predictor  
*A Circular Digital Ecosystem to Address Food Insecurity in the UK*  

**Author:** Pawan Malla – MSc Human-Computer Interaction, UCA  
**Role:** Lead Designer, Developer, and Insights Strategist  

🔗 **Live Demo (Resource Map):** [pmt999.github.io/ResourceMap](https://pmt999.github.io/ResourceMap/)  
🔗 **Live Demo (Restaurant Predictor):** [https://pmt999.github.io/RestaurantPredictor-/] (https://pmt999.github.io/RestaurantPredictor-/)
---

## 📖 Project Overview  

Food insecurity and food waste remain two of the UK’s biggest socio-economic challenges:  

- **14% of households** faced food insecurity in Jan 2025 (Food Foundation).  
- **2.9 million food parcels** distributed by Trussell Trust in 2024–25, with 1 million to children.  
- **20% rise in homelessness** in England from 2023–24.  

At the same time, the hospitality sector wastes huge volumes of edible food. NGOs like FareShare, City Harvest, Too Good To Go, and Olio have made progress, but each has **limitations** (indirect access, commercial focus, accountability gaps, fundraising dependency).  

This project develops **two interconnected web apps** as part of a circular digital ecosystem:  

1. **Resource Map** – a geolocation-based donation platform where helpers post surplus resources (food, clothes, etc.), needers request pickups, and admins oversee accountability.  
2. **Restaurant Predictor** – an AI tool that predicts diner demand, reducing overstaffing and waste. It integrates with recycling partners (e.g., **Olleco**) to monetise compostable waste, with restaurants donating savings into the Resource Map.  

Together, these tools create a **sustainable feedback loop**: less waste → cost savings → recycling revenue → community donations.  

---

## 🚀 Features  

### 🔴 Resource Map  
- Roles: **Needer, Helper, Admin**.  
- **Geolocation pins** (blue = users, red = resources).  
- **Request Pickup** → Helper **Confirms & Prints Receipt** → Both parties **Mark Done**.  
- **City Harvest delivery option** available after confirmation.  
- **Feedback modal** (yellow stars + text, up to 100 words).  
- **Admin dashboard**: manage resources, requests, history, CSV exports.  
- **Accessibility**: mobile-first, WCAG-aligned.  

👉 [Try Resource Map](https://pmt999.github.io/ResourceMap/)  

### 🟢 Restaurant Predictor  
- **AI demand forecasting** (TensorFlow.js).  
- **Human-in-the-loop learning**: restaurants enter daily actuals, AI accuracy improves.  
- **Donate Now** button posts surplus directly into Resource Map.  
- **Olleco integration**: log compostable waste → generate recycling revenue.  
- **Supports financial sustainability** for NGOs by reducing dependency on donors.  

📊 Example Test (Chautari Restaurant, Aldershot):  
- Initial prediction: **12 diners** vs **39 actual** (inaccurate).  
- After learning: **26 predicted** vs **31 actual** (much closer).  

---

## 🧪 Iterative Development  

### Resource Map Iterations  
1. Basic map + login → inaccurate GPS.  
2. Continuous geolocation + accuracy circle.  
3. Request Pickup flow (unique IDs to stop duplicates).  
4. City Harvest delivery integration.  
5. Feedback, CSV exports, admin dashboard.  

### Restaurant Predictor Iterations  
1. Early TensorFlow.js model → poor accuracy.  
2. Human-in-loop training → improved results (12 → 26 vs 31).  
3. Added “Donate Now” button.  
4. Integrated Olleco recycling pathway.  

---

## 🎤 Stakeholder Insights  

- **Farnborough Council:** food waste currently goes to Basingstoke to be converted into gas. Confirmed no direct redistribution tools.  
- **Supermarkets:**  
  - Lidl Aldershot – staff too busy to adopt apps without extra hires.  
  - Morrison’s – donates before-expiry food outside stores; NGOs collect.  
- **Independent stores (Little Asia, Namaste, Gulfstore):** excited about Resource Map; said they could donate surplus products before expiry instead of throwing them away.  

This feedback confirms the apps’ **real-world perceived usefulness**:  
- Large supermarkets face labour barriers.  
- Smaller stores & restaurants see clear value in participation.  

---

## 📚 Reflection   

- **Description:** Began as a Term Two Tower Hamlets mini-project → scaled into a UK-wide dual ecosystem (Resource Map + Predictor + Olleco).  
- **Feelings:** Motivated but overwhelmed; inspired by NGOs but frustrated by their gaps; grew confident after iterative improvements.  
- **Evaluation:**  
  - ✅ Strengths: direct-to-needer, donation-first, accountability, financial sustainability.  
  - ⚠️ Weaknesses: scalability (localStorage demo), supermarket reluctance.  
  - 🔮 Opportunities: council kiosks, DEFRA policy alignment, Olleco partnerships.  
- **Analysis:**  
  - Symbolic (pins, stars, dots = trust + clarity).  
  - Product (functional donation + prediction tools).  
  - System (restaurants ↔ NGOs ↔ recycling ↔ needers).  
  - Culture (reframing waste as value).  
- **Conclusion**:** The project demonstrates how HCI can design **circular ecosystems** that integrate usability, inclusivity, financial sustainability, and community benefit.  

---

## 📂 Repository Structure 
/ResourceMap
├── index.html # Main Resource Map app
├── script.js # Core JS (map logic, roles, notifications)
├── style.css # Stylesheet (dark theme, WCAG aligned)
└── /assets # Logos, map icons, images

/RestaurantPredictor
├── resturant.html # Predictor app main page
├── script.js # AI prediction + Donate Now logic
├── style.css # Stylesheet (dashboard look)
└── /assets # Supporting assets




 


