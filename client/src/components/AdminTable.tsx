import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil, Trash2 } from "lucide-react";

interface AdminTableProps {
  type: "models" | "results";
  data: any[];
}

export function AdminTable({ type, data }: AdminTableProps) {
  if (type === "models") {
    return (
      <Table data-testid="table-admin-models">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((model) => (
            <TableRow key={model.id} data-testid={`row-model-${model.id}`}>
              <TableCell className="font-medium">{model.name}</TableCell>
              <TableCell>{model.slug}</TableCell>
              <TableCell>{model.version}</TableCell>
              <TableCell>
                <Badge variant={model.status === "published" ? "default" : "secondary"}>
                  {model.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" data-testid={`button-view-${model.id}`} className="hover-elevate active-elevate-2">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" data-testid={`button-edit-${model.id}`} className="hover-elevate active-elevate-2">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" data-testid={`button-delete-${model.id}`} className="hover-elevate active-elevate-2">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table data-testid="table-admin-results">
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((result) => (
          <TableRow key={result.id} data-testid={`row-result-${result.id}`}>
            <TableCell>{result.date}</TableCell>
            <TableCell>{result.userName}</TableCell>
            <TableCell>{result.company}</TableCell>
            <TableCell>{result.modelName}</TableCell>
            <TableCell>
              <Badge variant="secondary">{result.score}</Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="icon" data-testid={`button-view-result-${result.id}`} className="hover-elevate active-elevate-2">
                <Eye className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
