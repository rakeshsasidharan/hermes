import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Welcome to Hermes</h1>
        <p className="text-muted-foreground">Your personal email management system</p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Manage Addresses</CardTitle>
          <CardDescription>Add and manage your email addresses</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/home" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Go to Addresses
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}