export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  console.log(req.body);
  const order = req.body.order;
  if (!order) {
    return res.status(400).json({ message: "No order data" });
  }

  // Filter: only custom or feedback-based orders
  if (order.source !== "Feedback form" && !order.custom_fields?.custom_request) {
    return res.status(200).json({ message: "Ignored non-priority order" });
  }

  const uniqueId = `REQ-${order.id}-${Date.now()}`;
  const taskPayload = {
    name: `New Request: ${order.customer_name} (${uniqueId})`,
    description: `
      Source: ${order.source}
      Customer: ${order.customer_name} (${order.customer_email})
      Notes: ${order.notes || ""}
      Booqable Order ID: ${order.id}
      Unique ID: ${uniqueId}
    `,
    priority: "high",
  };

  try {
    // Create task in Holded
    const holdedRes = await fetch("https://api.holded.com/api/tasks/v1/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HOLDED_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskPayload),
    });

    if (!holdedRes.ok) {
      const errText = await holdedRes.text();
      console.error("Holded API error:", errText);
      return res.status(500).json({ message: "Failed to create Holded task", errText });
    }

    // Update Booqable (optional)
    await fetch(`https://api.booqable.com/api/1/orders/${order.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.BOOQABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: { custom_fields: { synced_to_holded: true, holded_task_id: uniqueId } },
      }),
    });

    return res.status(200).json({ message: "Task created successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
}